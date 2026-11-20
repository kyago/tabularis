import {lazy, Suspense, useState, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {
    ArrowLeftRight,
    CopyPlus,
    Database,
    Download,
    FileSpreadsheet,
    Folder,
    FolderInput,
    FolderPlus,
    FolderTree,
    ListChecks,
    Pencil,
    Trash2,
    X,
} from 'lucide-react';
import {ConfirmModal} from '@/components/modals/ConfirmModal';
import {ExportConnectionsModal, type ExportMode} from '@/components/modals/ExportConnectionsModal';
import {ContextMenu, type ContextMenuItem} from '@/components/ui/ContextMenu';
import type {ConnectionGroup, SavedConnection} from '@/contexts/DatabaseContext';
import {useAlert} from '@/hooks/useAlert';
import {useBuiltinPostgresMigration} from '@/hooks/useBuiltinDriverMigration';
import {useConnectionCatalogue} from '@/hooks/useConnectionCatalogue';
import {useCreateSqliteDatabase} from '@/hooks/useCreateSqliteDatabase';
import {useDatabase} from '@/hooks/useDatabase';
import {useDrivers} from '@/hooks/useDrivers';
import {useMigrationOutcomeToast} from '@/hooks/useMigrationOutcomeToast';
import {usePlatformCapabilities} from '@/hooks/usePlatformCapabilities';
import {useTabularisClient} from '@/hooks/useTabularisClient';
import {useToast} from '@/hooks/useToast';
import {saveGeneratedFile} from '@/utils/connectionFiles';
import {migrationDirectionForDriver} from '@/utils/connections';
import {requestOpenDataFiles} from '@/utils/dataFiles';
import {toErrorMessage} from '@/utils/errors';
import {flattenGroupTree} from '@/utils/groupTree';
import {resolvePluginRepoUrl} from '@/utils/pluginIssueReport';

const NewConnectionModal = lazy(() =>
    import('@/components/modals/NewConnectionModal').then((m) => ({
        default: m.NewConnectionModal,
    })),
);
const ImportFromAppModal = lazy(() =>
    import('@/components/modals/ImportFromAppModal').then((m) => ({
        default: m.ImportFromAppModal,
    })),
);
const MigrationChecklistModal = lazy(() =>
    import('@/components/modals/MigrationChecklistModal').then((m) => ({
        default: m.MigrationChecklistModal,
    })),
);

interface Confirm {
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
}

interface FolderPrompt {
    title: string;
    message: string;
    value: string;
    submit: (name: string) => Promise<unknown>;
}

interface Options {
    /** Opens a connection and shows it (used after creating a SQLite database). */
    connect: (connectionId: string, name: string) => void;
}

const iconButton =
    'w-6 h-6 shrink-0 flex items-center justify-center rounded text-muted hover:bg-surface-secondary hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus';

/**
 * Everything the Connections page does to connections and folders, for the
 * sidebar tree that replaces it: context menu items, the selection bar and
 * the dialogs they open.
 */
export function useConnectionTreeActions({connect}: Options) {
    const {t} = useTranslation();
    const client = useTabularisClient();
    const platform = usePlatformCapabilities();
    const {showAlert} = useAlert();
    const {showToast} = useToast();
    const {
        connections,
        connectionGroups,
        loadConnections,
        disconnect,
        isConnectionOpenAnywhere,
        moveConnectionToGroup,
        createGroupPath,
        updateGroup,
        deleteGroup,
    } = useDatabase();
    const {allDrivers, installedPlugins} = useDrivers();
    const {createSqliteDatabase} = useCreateSqliteDatabase();
    const migration = useBuiltinPostgresMigration();
    const {registry: catalogueRegistry} = useConnectionCatalogue(false);
    const showMigrationOutcome = useMigrationOutcomeToast({
        migration,
        catalogueRegistry,
        installedPlugins,
    });

    // `null` is closed; `{connection: null}` is a new connection.
    const [editor, setEditor] = useState<{connection: SavedConnection | null} | null>(null);
    const [confirm, setConfirm] = useState<Confirm | null>(null);
    const [folderPrompt, setFolderPrompt] = useState<FolderPrompt | null>(null);
    const [menu, setMenu] = useState<{x: number; y: number; items: ContextMenuItem[]} | null>(null);
    // Selection mode for bulk actions; `null` while it is off.
    const [selected, setSelected] = useState<Set<string> | null>(null);
    // Which connections the export dialog covers; `null` while it is closed.
    const [exporting, setExporting] = useState<'all' | 'selected' | null>(null);
    const [isImportingFromApp, setIsImportingFromApp] = useState(false);
    const [isReviewingMigration, setIsReviewingMigration] = useState(false);

    const fail = (failure: string, e: unknown) =>
        showAlert(`${failure}\n\nError: ${toErrorMessage(e)}`, {kind: 'error'});

    const run = async (failure: string, action: () => Promise<unknown>) => {
        try {
            await action();
            await loadConnections();
        } catch (e) {
            fail(failure, e);
        }
    };

    const openMenu = (e: React.MouseEvent, items: ContextMenuItem[]) => {
        e.preventDefault();
        setMenu({x: e.clientX, y: e.clientY, items});
    };

    const edit = async (connection: SavedConnection) => {
        // Like the Connections page: settings change on a closed connection.
        if (isConnectionOpenAnywhere(connection.id)) await disconnect(connection.id);
        setEditor({connection});
    };

    const deleteConnections = async (ids: string[]) => {
        for (const id of ids) {
            if (isConnectionOpenAnywhere(id)) await disconnect(id);
            await client.call('delete_connection', {id});
        }
    };

    const moveToGroup = (ids: string[], groupId: string | null) =>
        run(t('groups.moveError', {defaultValue: 'Failed to move connection'}), async () => {
            const siblings = connections.filter(
                (c) => (c.group_id ?? null) === groupId && !ids.includes(c.id),
            );
            let next = Math.max(-1, ...siblings.map((c) => c.sort_order ?? -1)) + 1;
            for (const id of ids) await moveConnectionToGroup(id, groupId, next++);
        });

    const moveTargets = (ids: string[], currentGroupId?: string): ContextMenuItem[] =>
        flattenGroupTree(connectionGroups)
            .filter(({group}) => group.id !== currentGroupId)
            .map(({group, depth}) => ({
                label: group.name,
                icon: Folder,
                indent: depth,
                action: () => void moveToGroup(ids, group.id),
            }));

    // Same confirmation as the Connections page. A connection-URI connection gets
    // an extra warning: the driver flip drops the stored URI by design.
    const confirmMigration = (
        connection: SavedConnection,
        direction: 'to-plugin' | 'to-builtin',
    ) => {
        const isUriBased = connection.params.connection_uri_in_keychain === true;
        const name = connection.name;
        if (direction === 'to-plugin') {
            setConfirm({
                title: t('migration.confirm.title'),
                message: t(
                    isUriBased ? 'migration.confirm.uriMessage' : 'migration.confirm.message',
                    {
                        name,
                    },
                ),
                confirmLabel: t(
                    isUriBased
                        ? 'migration.confirm.confirmLabelUri'
                        : 'migration.confirm.confirmLabel',
                ),
                variant: isUriBased ? 'warning' : 'info',
                onConfirm: () =>
                    void migration.migrateConnection(connection.id).then(showMigrationOutcome),
            });
            return;
        }
        setConfirm({
            title: t('migration.confirm.undoTitle'),
            message: t('migration.confirm.undoMessage', {name}),
            confirmLabel: t('migration.confirm.undoConfirmLabel'),
            variant: 'info',
            onConfirm: () =>
                void migration.undoMigration(connection.id).then((result) => {
                    if (result.ok) return;
                    showToast(
                        t('migration.toast.undoFailed', {
                            name,
                            error: result.error ?? 'unknown error',
                        }),
                        {kind: 'error', duration: 0},
                    );
                }),
        });
    };

    const connectionItems = (connection: SavedConnection): ContextMenuItem[] => {
        const targets = moveTargets([connection.id], connection.group_id);
        const direction = migrationDirectionForDriver(connection.params.driver, allDrivers);
        return [
            {
                label: t('connections.edit'),
                icon: Pencil,
                action: () => void run(t('connections.failDisconnect'), () => edit(connection)),
            },
            {
                label: t('connections.duplicate'),
                icon: CopyPlus,
                action: () =>
                    void run(t('connections.failDuplicate'), async () => {
                        const copy = await client.call('duplicate_connection', {
                            id: connection.id,
                        });
                        setEditor({connection: copy});
                    }),
            },
            ...(direction
                ? [
                      {
                          label: t(
                              direction === 'to-plugin'
                                  ? 'migration.switchToPlugin'
                                  : 'migration.switchToBuiltin',
                          ),
                          icon: ArrowLeftRight,
                          action: () => confirmMigration(connection, direction),
                      },
                  ]
                : []),
            ...(targets.length > 0
                ? [
                      {separator: true},
                      {label: t('groups.moveToGroup'), icon: FolderTree, submenu: targets},
                  ]
                : []),
            ...(connection.group_id
                ? [
                      {
                          label: t('groups.removeFromGroup'),
                          icon: X,
                          action: () => void moveToGroup([connection.id], null),
                      },
                  ]
                : []),
            {separator: true},
            {
                label: t('connections.delete'),
                icon: Trash2,
                danger: true,
                action: () =>
                    setConfirm({
                        title: `${t('connections.deleteTitle')}: ${connection.name}`,
                        message: t('connections.confirmDelete'),
                        onConfirm: () =>
                            void run(t('connections.failDelete'), () =>
                                deleteConnections([connection.id]),
                            ),
                    }),
            },
        ];
    };

    const promptNewFolder = (parentId: string | null) =>
        setFolderPrompt({
            title: parentId
                ? t('groups.newSubfolder', {defaultValue: 'New subfolder'})
                : t('groups.newGroup'),
            message: t('groups.subgroupNamePrompt', {
                defaultValue: 'Subfolder name (use / for nested levels)',
            }),
            value: '',
            submit: (name) => createGroupPath(name, parentId),
        });

    const folderItems = (group: ConnectionGroup): ContextMenuItem[] => [
        {
            label: t('groups.newSubfolder', {defaultValue: 'New subfolder'}),
            icon: FolderPlus,
            action: () => promptNewFolder(group.id),
        },
        {
            label: t('groups.rename'),
            icon: Pencil,
            action: () =>
                setFolderPrompt({
                    title: t('groups.rename'),
                    message: t('groups.groupName'),
                    value: group.name,
                    submit: (name) => updateGroup(group.id, {name}),
                }),
        },
        {separator: true},
        {
            label: t('groups.delete'),
            icon: Trash2,
            danger: true,
            action: () =>
                setConfirm({
                    title: t('groups.deleteTitle'),
                    message: t('groups.deleteConfirm', {name: group.name}),
                    onConfirm: () =>
                        void run(
                            t('groups.deleteError', {defaultValue: 'Failed to delete group'}),
                            () => deleteGroup(group.id),
                        ),
                }),
        },
    ];

    const rootItems: ContextMenuItem[] = [
        {label: t('groups.newGroup'), icon: FolderPlus, action: () => promptNewFolder(null)},
        {
            label: t('sidebar.selectConnections'),
            icon: ListChecks,
            action: () => setSelected(new Set()),
        },
        {separator: true},
        {
            label: t('connections.newSqliteDatabase.menuLabel'),
            icon: Database,
            action: () =>
                void run(t('connections.newSqliteDatabase.error'), async () => {
                    const created = await createSqliteDatabase();
                    if (!created) return;
                    await loadConnections();
                    connect(created.id, created.name);
                }),
        },
        {
            label: t('dataFiles.openMenu'),
            icon: FileSpreadsheet,
            action: () => requestOpenDataFiles(),
        },
        {separator: true},
        {
            label: t('connections.importFromApp.menuLabel'),
            icon: FolderInput,
            action: () => setIsImportingFromApp(true),
        },
        {label: t('connections.export'), icon: Download, action: () => setExporting('all')},
        ...(migration.builtinConnections.length > 0
            ? [
                  {separator: true},
                  {
                      label: t('sidebar.reviewMigration'),
                      icon: ArrowLeftRight,
                      action: () => setIsReviewingMigration(true),
                  },
              ]
            : []),
    ];

    const submitFolderPrompt = () => {
        const name = folderPrompt?.value.trim();
        if (!folderPrompt || !name) return;
        setFolderPrompt(null);
        void run(t('groups.createError'), () => folderPrompt.submit(name));
    };

    const exportConnections = async (mode: ExportMode, password?: string) => {
        try {
            const generated = await client.call('export_connections_file', {
                mode,
                ...(password ? {password} : {}),
                connectionIds: exporting === 'selected' && selected?.size ? [...selected] : null,
            });
            await saveGeneratedFile(client, platform, generated);
        } catch (e) {
            if (String(e).includes('SECRET_EXPORT_CANCELLED')) return;
            fail(t('connections.export'), e);
        }
    };

    const count = selected?.size ?? 0;
    const selectionBar: ReactNode = selected && (
        <div className="w-full flex items-center gap-0.5 px-2 py-1 text-xs text-secondary">
            <span className="flex-1 truncate">{t('connections.selectedCount', {count})}</span>
            <button
                type="button"
                disabled={count === 0}
                onClick={(e) =>
                    openMenu(e, [
                        {
                            label: t('groups.ungrouped'),
                            icon: X,
                            action: () => void moveToGroup([...selected], null),
                        },
                        {separator: true},
                        ...moveTargets([...selected]),
                    ])
                }
                aria-label={t('connections.moveSelected')}
                title={t('connections.moveSelected')}
                className={iconButton}
            >
                <FolderTree size={13} />
            </button>
            <button
                type="button"
                disabled={count === 0}
                onClick={() => setExporting('selected')}
                aria-label={t('connections.exportSelected')}
                title={t('connections.exportSelected')}
                className={iconButton}
            >
                <Download size={13} />
            </button>
            <button
                type="button"
                disabled={count === 0}
                onClick={() =>
                    setConfirm({
                        title: t('connections.deleteSelectedTitle'),
                        message: t('connections.confirmDeleteSelected', {count}),
                        onConfirm: () =>
                            void run(t('connections.failDelete'), () =>
                                deleteConnections([...selected]),
                            ).then(() => setSelected(new Set())),
                    })
                }
                aria-label={t('connections.deleteSelected')}
                title={t('connections.deleteSelected')}
                className={`${iconButton} hover:text-accent-error`}
            >
                <Trash2 size={13} />
            </button>
            <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label={t('connections.deselectAll')}
                title={t('connections.deselectAll')}
                className={iconButton}
            >
                <X size={13} />
            </button>
        </div>
    );

    const dialogs: ReactNode = (
        <>
            {menu && (
                <ContextMenu
                    x={menu.x}
                    y={menu.y}
                    items={menu.items}
                    onClose={() => setMenu(null)}
                />
            )}
            <Suspense fallback={null}>
                {editor && (
                    <NewConnectionModal
                        isOpen
                        onClose={() => setEditor(null)}
                        onSave={() => void loadConnections()}
                        initialConnection={editor.connection}
                    />
                )}
                {isImportingFromApp && (
                    <ImportFromAppModal
                        isOpen
                        onClose={() => setIsImportingFromApp(false)}
                        onImported={() => void loadConnections()}
                    />
                )}
                {isReviewingMigration && (
                    <MigrationChecklistModal
                        isOpen
                        onClose={() => setIsReviewingMigration(false)}
                        connections={migration.builtinConnections}
                        manifest={allDrivers.find((d) => d.id === migration.pluginId)}
                        repoUrl={resolvePluginRepoUrl(
                            migration.pluginId,
                            catalogueRegistry.find((p) => p.id === migration.pluginId)?.repo_url,
                        )}
                        pluginVersion={
                            installedPlugins.find((p) => p.id === migration.pluginId)?.version ??
                            catalogueRegistry.find((p) => p.id === migration.pluginId)
                                ?.installed_version ??
                            'unknown'
                        }
                        migrateConnection={migration.migrateConnection}
                    />
                )}
            </Suspense>
            <ExportConnectionsModal
                isOpen={exporting !== null}
                onClose={() => setExporting(null)}
                onExport={exportConnections}
                selectedCount={exporting === 'selected' ? count : 0}
            />
            <ConfirmModal
                isOpen={confirm !== null}
                onClose={() => setConfirm(null)}
                title={confirm?.title ?? ''}
                message={confirm?.message ?? ''}
                confirmLabel={confirm?.confirmLabel}
                variant={confirm?.variant}
                onConfirm={() => {
                    confirm?.onConfirm();
                    setConfirm(null);
                }}
            />
            <ConfirmModal
                variant="info"
                isOpen={folderPrompt !== null}
                onClose={() => setFolderPrompt(null)}
                title={folderPrompt?.title ?? ''}
                message={folderPrompt?.message ?? ''}
                confirmDisabled={!folderPrompt?.value.trim()}
                onConfirm={submitFolderPrompt}
            >
                <input
                    autoFocus
                    aria-label={folderPrompt?.message}
                    value={folderPrompt?.value ?? ''}
                    onChange={(e) =>
                        setFolderPrompt((prev) => prev && {...prev, value: e.target.value})
                    }
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') submitFolderPrompt();
                    }}
                    className="w-full bg-base border border-strong rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-focus transition-colors"
                />
            </ConfirmModal>
        </>
    );

    return {
        newConnection: () => setEditor({connection: null}),
        connectionItems,
        folderItems,
        rootItems,
        openMenu,
        fail,
        /** Ids picked in selection mode, or `null` while it is off. */
        selected,
        toggleSelected: (id: string) =>
            setSelected((prev) => {
                if (!prev) return prev;
                const next = new Set(prev);
                if (!next.delete(id)) next.add(id);
                return next;
            }),
        selectionBar,
        dialogs,
    };
}
