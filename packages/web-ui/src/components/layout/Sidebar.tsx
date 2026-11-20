import {webPath} from '@/utils/webBasePath';
import {lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import clsx from 'clsx';
import {
    Plug2,
    Settings,
    Cpu,
    PanelLeft,
    Layers,
    Star,
    Clock,
    BookOpen,
    FolderTree,
    Plus,
    MoreHorizontal,
    Search,
    SquareTerminal,
} from 'lucide-react';
import {DiscordIcon} from '@/components/icons/DiscordIcon';
import {usePlatformCapabilities} from '@/hooks/usePlatformCapabilities';
import {DISCORD_URL} from '@/config/links';
import {useDatabase} from '@/hooks/useDatabase';
import {useTheme} from '@/hooks/useTheme';
import {SlotAnchor} from '@/components/ui/SlotAnchor';

// Sub-components
import {NavItem} from './sidebar/NavItem';
import {RailIndicator} from './sidebar/RailIndicator';
import {OpenConnectionItem} from './sidebar/OpenConnectionItem';
import {ConnectionGroupItem} from './sidebar/ConnectionGroupItem';
import {ConnectionGroupFolder} from './sidebar/ConnectionGroupFolder';
import {useConnectionTreeActions} from './sidebar/useConnectionTreeActions';
import {useConnectionTreeDrag} from './sidebar/useConnectionTreeDrag';
import {useConnectionTags} from '@/hooks/useConnectionTags';
import {fuzzyFilter} from '@/utils/fuzzy';
import {consoleSummaries, loadEditorPreferences, type ConsoleSummary} from '@/utils/editor';
import {useEditor} from '@/hooks/useEditor';
import {useTabularisClient} from '@/hooks/useTabularisClient';
import type {SavedConnection} from '@/contexts/DatabaseContext';
import type {SidebarTab} from './ExplorerSidebar';
import {LoadingState} from '@/components/ui/LoadingState';
import {PanelDatabaseProvider} from './PanelDatabaseProvider';
import {DiscordCommunityCallout} from './sidebar/DiscordCommunityCallout';

// Hooks & Utils
import {useSidebarResize} from '@/hooks/useSidebarResize';
import {useConnectionManager, type ConnectionStatus} from '@/hooks/useConnectionManager';
import {useOpenConnectionInNewWindow} from '@/hooks/useOpenConnectionInNewWindow';
import {useConnectionLayoutContext} from '@/hooks/useConnectionLayoutContext';
import {canAddToSplit, isConnectionGrouped} from '@/utils/connectionLayout';
import {rectContains, startPointerDrag} from '@/utils/pointerDrag';
import {useDrivers} from '@/hooks/useDrivers';
import {useKeybindings} from '@/hooks/useKeybindings';
import {useSettings} from '@/hooks/useSettings';
import {groupSidebarConnections, inSavedOrder} from '@/utils/connectionManager';
import {useAlert} from '@/hooks/useAlert';
import {toErrorMessage} from '@/utils/errors';
import {buildEditorRoute, isEditorRoute, type ConnectionsRouteState} from '@/routing';
import {useAvailableUpdates} from '@/hooks/useAvailableUpdates';
import {UpdateBadge} from '@/components/ui/UpdateBadge';

const ExplorerSidebar = lazy(() =>
    import('./ExplorerSidebar').then((module) => ({
        default: module.ExplorerSidebar,
    })),
);

/** The consoles saved with one connection, listed under it in the tree. */
const ConnectionConsoleList = ({
    consoles,
    activeId,
    depth,
    emptyLabel,
    onOpen,
}: {
    consoles: ConsoleSummary[];
    activeId: string | null;
    depth: number;
    emptyLabel: string;
    onOpen: (tabId: string) => void;
}) => {
    const paddingLeft = 8 + depth * 12 + 14;
    if (consoles.length === 0) {
        return (
            <div
                className="w-full h-6 flex items-center text-[11px] italic text-muted"
                style={{paddingLeft}}
            >
                {emptyLabel}
            </div>
        );
    }
    return consoles.map((item) => (
        <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            aria-current={item.id === activeId ? 'true' : undefined}
            title={item.preview || item.title}
            style={{paddingLeft}}
            className={clsx(
                'w-full h-6 flex items-center gap-1.5 pr-2 rounded text-[11px] text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                item.id === activeId
                    ? 'bg-surface-secondary text-primary'
                    : 'text-secondary hover:bg-surface-secondary hover:text-primary',
            )}
        >
            <SquareTerminal size={11} className="shrink-0 text-muted" />
            <span className="truncate shrink-0 max-w-full">{item.title}</span>
            {item.preview && <span className="truncate flex-1 text-muted">{item.preview}</span>}
        </button>
    ));
};

export const Sidebar = () => {
    const platform = usePlatformCapabilities();
    const {t} = useTranslation();
    const updates = useAvailableUpdates();
    const {currentTheme} = useTheme();
    const isDarkTheme = !currentTheme?.id?.includes('-light');
    const {
        activeConnectionId,
        activeDriver,
        connections,
        connectionGroups,
        isConnectionOpenAnywhere,
        toggleGroupCollapsed,
    } = useDatabase();
    const {showAlert} = useAlert();
    const {settings} = useSettings();
    const navigate = useNavigate();
    const location = useLocation();

    const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
    const [sidebarTab, setSidebarTab] = useState<SidebarTab>('structure');
    const [showShortcutHints, setShowShortcutHints] = useState(false);
    const {isMac} = useKeybindings();

    useEffect(() => {
        const handler = () => setIsExplorerCollapsed((prev) => !prev);
        window.addEventListener('tabularis:toggle-sidebar', handler);
        return () => window.removeEventListener('tabularis:toggle-sidebar', handler);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const modifierHeld = isMac ? e.metaKey || e.ctrlKey : e.ctrlKey;
            if (modifierHeld && e.shiftKey) setShowShortcutHints(true);
        };
        const handleKeyUp = () => setShowShortcutHints(false);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleKeyUp);
        };
    }, [isMac]);

    const {
        connections: connectionStatuses,
        openConnections,
        handleConnect,
        handleDisconnect: disconnectConnection,
        handleSwitch,
    } = useConnectionManager();

    const {allDrivers} = useDrivers();

    const {
        splitView,
        isSplitVisible,
        selectedConnectionIds,
        toggleSelection,
        activateSplit,
        hideSplitView,
        addConnectionToSplit,
        explorerConnectionId,
    } = useConnectionLayoutContext();

    const collapseExplorer = useCallback(() => setIsExplorerCollapsed(true), []);
    const {sidebarWidth, startResize} = useSidebarResize(collapseExplorer);

    // Sidebar-only ordering (in-memory, resets when connections close)
    const [sidebarOrder, setSidebarOrder] = useState<string[]>([]);

    // Build a flat list of non-split open connections, sorted by sidebar order
    const sortedSidebarConnections = useMemo(() => {
        const nonSplit = openConnections.filter((conn) => !isConnectionGrouped(conn.id, splitView));
        const orderMap = new Map(sidebarOrder.map((id, i) => [id, i]));
        return nonSplit.sort((a, b) => {
            const oa = orderMap.get(a.id);
            const ob = orderMap.get(b.id);
            // Connections not in sidebarOrder go at the end, in their original order
            if (oa === undefined && ob === undefined) return 0;
            if (oa === undefined) return 1;
            if (ob === undefined) return -1;
            return oa - ob;
        });
    }, [openConnections, splitView, sidebarOrder]);

    // Tree mode lists every saved connection by name at its saved position, open
    // or not, so opening and closing never moves the others.
    const treeMode = settings.groupSidebarConnectionsByFolder === true;
    const [treeSearch, setTreeSearch] = useState('');
    const {tags} = useConnectionTags();
    const tagById = new Map(tags.map((tag) => [tag.id, tag]));
    const tagsOf = (saved: SavedConnection | undefined) =>
        (saved?.tag_ids ?? []).flatMap((id) => tagById.get(id) ?? []);
    const isSearching = treeMode && treeSearch.trim() !== '';
    // Name, driver and tag names, like the Connections page search.
    const matchingIds = isSearching
        ? new Set(
              fuzzyFilter(
                  connections,
                  treeSearch,
                  (c) =>
                      `${c.name} ${c.params.driver} ${tagsOf(c)
                          .map((tag) => tag.name)
                          .join(' ')}`,
              ).map((c) => c.id),
          )
        : null;
    const sidebarFolders = treeMode
        ? groupSidebarConnections(
              inSavedOrder(connectionStatuses, connections).filter(
                  (c) => !matchingIds || matchingIds.has(c.id),
              ),
              connections,
              connectionGroups,
              // Empty folders are worth showing, except among search results.
              !isSearching,
          )
        : null;
    // In tree mode the sidebar replaces the Connections page.
    const tree = useConnectionTreeActions({
        connect: (id, name) => void handleConnectFromRail(id, name),
    });
    // Folders remember their collapsed state with the connections, as on the page.
    const collapsedFolders = new Set(connectionGroups.filter((g) => g.collapsed).map((g) => g.id));
    const drag = useConnectionTreeDrag({
        enabled: treeMode && !isSearching && tree.selected === null,
        onError: (e) =>
            tree.fail(t('groups.moveError', {defaultValue: 'Failed to move connection'}), e),
        hasVisibleContent: (groupId) =>
            !collapsedFolders.has(groupId) &&
            (connectionGroups.some((g) => g.parent_id === groupId) ||
                connections.some((c) => c.group_id === groupId)),
    });
    const {newConnection} = tree;

    // Consoles saved with each connection, listed under the connections expanded
    // in the tree. The active connection's come live from the editor; the others
    // are read from where the editor stores them.
    const client = useTabularisClient();
    const editor = useEditor();
    const [storedConsoles, setStoredConsoles] = useState<Record<string, ConsoleSummary[]>>({});
    const loadConsoles = useCallback(
        async (connectionId: string) => {
            const {tabs} = await loadEditorPreferences(client, connectionId);
            // Still expanded when the answer arrives?
            setStoredConsoles((prev) =>
                connectionId in prev ? {...prev, [connectionId]: consoleSummaries(tabs)} : prev,
            );
        },
        [client],
    );
    const toggleConsoles = (connectionId: string) => {
        if (connectionId in storedConsoles) {
            setStoredConsoles((prev) =>
                Object.fromEntries(Object.entries(prev).filter(([id]) => id !== connectionId)),
            );
            return;
        }
        setStoredConsoles((prev) => ({...prev, [connectionId]: []}));
        void loadConsoles(connectionId);
    };
    const expandedIds = Object.keys(storedConsoles).join(',');
    useEffect(() => {
        // The connection just left may have new or edited consoles: read them again.
        for (const id of expandedIds ? expandedIds.split(',') : []) void loadConsoles(id);
    }, [activeConnectionId, expandedIds, loadConsoles]);
    const openConsole = (conn: ConnectionStatus, tabId: string) => {
        editor.openTab(conn.id, tabId);
        if (conn.isOpen) handleOpenInEditor(conn.id);
        else void handleConnectFromRail(conn.id, conn.name);
    };
    const openNewRequested =
        treeMode && (location.state as ConnectionsRouteState | null)?.openNew === true;
    useEffect(() => {
        // The "new connection" shortcut asks the Connections page; answer it here.
        if (openNewRequested) newConnection();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- newConnection is a fresh closure each render
    }, [openNewRequested, location.key]);
    // Hints must match the Cmd/Ctrl+Shift+N shortcut, which switches by open order
    const shortcutIndex = useMemo(
        () => new Map(openConnections.map((c, i) => [c.id, i])),
        [openConnections],
    );

    // Pointer-based rail drag: reorder connections or drop one onto the split
    // group badge (HTML5 DnD can freeze the WebKitGTK compositor)
    const [dropTarget, setDropTarget] = useState<{
        id: string;
        position: 'above' | 'below';
    } | null>(null);
    const [isGroupDropTarget, setIsGroupDropTarget] = useState(false);
    const itemRefs = useRef(new Map<string, HTMLDivElement>());
    const groupRef = useRef<HTMLDivElement | null>(null);
    const railDropRef = useRef<{id: string; position: 'above' | 'below'} | 'group' | null>(null);

    const applySidebarReorder = useCallback(
        (draggedId: string, target: {id: string; position: 'above' | 'below'}) => {
            const currentOrder = sortedSidebarConnections.map((c) => c.id);
            const reordered = currentOrder.filter((id) => id !== draggedId);
            let toIdx = reordered.indexOf(target.id);
            if (target.position === 'below') toIdx += 1;
            reordered.splice(toIdx, 0, draggedId);
            setSidebarOrder(reordered);
        },
        [sortedSidebarConnections],
    );

    const handleConnectionMoveStart = useCallback(
        (connId: string, connName: string, e: React.MouseEvent) => {
            if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
            startPointerDrag(e.clientX, e.clientY, {
                threshold: 5,
                createGhost: () => {
                    const ghost = document.createElement('div');
                    ghost.className =
                        'px-2 py-1 rounded text-xs bg-surface-secondary text-primary border border-default shadow-lg';
                    ghost.textContent = connName;
                    return ghost;
                },
                onDragMove: (x, y) => {
                    const groupEl = groupRef.current;
                    if (
                        groupEl &&
                        canAddToSplit(splitView, connId) &&
                        rectContains(groupEl.getBoundingClientRect(), x, y)
                    ) {
                        railDropRef.current = 'group';
                        setIsGroupDropTarget(true);
                        setDropTarget(null);
                        return;
                    }
                    let found: {id: string; position: 'above' | 'below'} | null = null;
                    for (const [id, el] of itemRefs.current) {
                        if (id === connId) continue;
                        const rect = el.getBoundingClientRect();
                        if (rectContains(rect, x, y)) {
                            found = {
                                id,
                                position: y < rect.top + rect.height / 2 ? 'above' : 'below',
                            };
                            break;
                        }
                    }
                    railDropRef.current = found;
                    setIsGroupDropTarget(false);
                    setDropTarget((prev) =>
                        prev?.id === found?.id && prev?.position === found?.position ? prev : found,
                    );
                },
                onDrop: () => {
                    const target = railDropRef.current;
                    if (target === 'group') {
                        addConnectionToSplit(connId);
                    } else if (target) {
                        applySidebarReorder(connId, target);
                    }
                },
                onEnd: () => {
                    railDropRef.current = null;
                    setDropTarget(null);
                    setIsGroupDropTarget(false);
                },
            });
        },
        [splitView, addConnectionToSplit, applySidebarReorder],
    );

    const handleSwitchToConnection = (connectionId: string) => {
        handleSwitch(connectionId);
        if (
            location.pathname === '/' ||
            location.pathname === '/connections' ||
            location.pathname === '/mcp' ||
            location.pathname === '/settings'
        ) {
            navigate('/editor');
        }
    };

    const handleSwitchOrSetExplorer = (connectionId: string) => {
        if (splitView) {
            hideSplitView();
        }
        handleSwitchToConnection(connectionId);
    };

    const handleDisconnectConnection = async (connectionId: string) => {
        const isLast = openConnections.length <= 1;
        await disconnectConnection(connectionId);
        if (isLast) {
            navigate('/');
        }
    };

    async function handleConnectFromRail(connectionId: string, name: string) {
        try {
            // Open in another window: focus that window instead of opening a duplicate.
            if (isConnectionOpenAnywhere(connectionId)) {
                await openConnectionInNewWindow(connectionId, name);
                return;
            }
            await handleConnect(connectionId);
            navigate(buildEditorRoute(connectionId));
        } catch (e) {
            showAlert(`${t('connections.failConnect', {name})}\n\nError: ${toErrorMessage(e)}`, {
                kind: 'error',
            });
        }
    }

    const handleOpenInEditor = (connectionId: string) => {
        handleSwitch(connectionId);
        navigate('/editor');
    };

    const openConnectionInNewWindow = useOpenConnectionInNewWindow();

    const handleOpenInNewWindow = (connectionId: string) => {
        const conn = connections.find((c) => c.id === connectionId);
        // Rail connections are already open (known-good), so this won't re-validate.
        void openConnectionInNewWindow(connectionId, conn?.name ?? null).catch((e) => {
            console.error(`[Sidebar] Failed to open connection in new window:`, e);
        });
    };

    const renderRailConnection = (conn: ConnectionStatus, depth = 0) => {
        const idx = shortcutIndex.get(conn.id);
        const saved = connections.find((c) => c.id === conn.id);
        return (
            <div
                key={conn.id}
                ref={(el) => {
                    if (el) itemRefs.current.set(conn.id, el);
                    else itemRefs.current.delete(conn.id);
                }}
                className="w-full flex flex-col items-center"
            >
                <OpenConnectionItem
                    layout={treeMode ? 'row' : 'icon'}
                    depth={depth}
                    onConnect={() => void handleConnectFromRail(conn.id, conn.name)}
                    manageItems={treeMode && saved ? tree.connectionItems(saved) : undefined}
                    checked={treeMode ? tree.selected?.has(conn.id) : undefined}
                    isExpanded={conn.id in storedConsoles}
                    onToggleExpand={
                        treeMode && tree.selected === null
                            ? () => toggleConsoles(conn.id)
                            : undefined
                    }
                    onToggleChecked={() => tree.toggleSelected(conn.id)}
                    tags={treeMode ? tagsOf(saved) : undefined}
                    connection={conn}
                    driverManifest={allDrivers.find((d) => d.id === conn.driver)}
                    isSelected={selectedConnectionIds.has(conn.id)}
                    onSwitch={() => handleSwitchOrSetExplorer(conn.id)}
                    onOpenInEditor={() => handleOpenInEditor(conn.id)}
                    onOpenInNewWindow={() => handleOpenInNewWindow(conn.id)}
                    onDisconnect={() => handleDisconnectConnection(conn.id)}
                    onToggleSelect={(isCtrlHeld) => toggleSelection(conn.id, isCtrlHeld)}
                    selectedConnectionIds={selectedConnectionIds}
                    onActivateSplit={activateSplit}
                    shortcutIndex={idx === undefined ? undefined : idx + 1}
                    showShortcutHint={showShortcutHints && idx !== undefined && idx < 9}
                    // The rail reorders its own in-memory list; the tree reorders the saved one.
                    onMoveMouseDown={(e) =>
                        treeMode
                            ? drag.startConnectionDrag(e, conn.id, conn.name)
                            : handleConnectionMoveStart(conn.id, conn.name, e)
                    }
                    dropIndicator={
                        treeMode
                            ? drag.connectionDrop?.id === conn.id
                                ? drag.connectionDrop.position === 'before'
                                    ? 'above'
                                    : 'below'
                                : null
                            : dropTarget?.id === conn.id
                              ? dropTarget.position
                              : null
                    }
                />
                {treeMode && conn.id in storedConsoles && (
                    <ConnectionConsoleList
                        // The active connection's consoles are in the editor right now.
                        consoles={
                            conn.id === activeConnectionId
                                ? consoleSummaries(editor.tabs)
                                : storedConsoles[conn.id]
                        }
                        activeId={conn.isActive ? editor.activeTabId : null}
                        depth={depth + 1}
                        emptyLabel={t('sidebar.noConsoles')}
                        onOpen={(tabId) => openConsole(conn, tabId)}
                    />
                )}
            </div>
        );
    };

    const explorerConnId = splitView && isSplitVisible ? explorerConnectionId : activeConnectionId;
    const shouldShowExplorer =
        !!explorerConnId &&
        location.pathname !== '/settings' &&
        location.pathname !== '/mcp' &&
        location.pathname !== '/connections';

    return (
        <div className="flex h-full">
            {/* Primary Navigation Bar (Narrow) */}
            <aside
                className={clsx(
                    'bg-elevated border-r border-default flex flex-col items-center py-4 z-20',
                    treeMode ? 'w-64' : 'w-16',
                )}
            >
                <div className="mb-8" title="tabularis">
                    <img
                        src={webPath('/logo.svg')}
                        alt="tabularis"
                        className="w-12 h-12 p-1.5 rounded-2xl mx-auto mb-4 shadow-lg shadow-accent-primary/30"
                        style={{
                            backgroundColor: isDarkTheme
                                ? currentTheme?.colors?.surface?.secondary || '#334155'
                                : currentTheme?.colors?.bg?.elevated || '#f8fafc',
                        }}
                    />
                </div>

                <nav className="flex-1 min-h-0 w-full flex flex-col items-center">
                    {treeMode ? (
                        <>
                            <div className="w-full flex items-center gap-1 px-2">
                                <button
                                    type="button"
                                    onClick={tree.newConnection}
                                    className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium bg-accent-primary text-inverse hover:bg-accent-primary/90 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                                >
                                    <Plus size={14} />
                                    {t('connections.addConnection')}
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => tree.openMenu(e, tree.rootItems)}
                                    aria-label={t('sidebar.moreConnectionActions')}
                                    title={t('sidebar.moreConnectionActions')}
                                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-muted hover:bg-surface-secondary hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                                >
                                    <MoreHorizontal size={16} />
                                </button>
                            </div>
                            <div className="w-full px-2 mt-2">
                                <div className="flex items-center gap-1.5 h-7 px-2 bg-base border border-default rounded-lg focus-within:border-focus transition-colors">
                                    <Search size={12} className="shrink-0 text-muted" />
                                    <input
                                        type="search"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={treeSearch}
                                        onChange={(e) => setTreeSearch(e.target.value)}
                                        placeholder={t('connections.searchPlaceholder')}
                                        aria-label={t('connections.searchPlaceholder')}
                                        className="w-full min-w-0 bg-transparent text-xs text-primary placeholder:text-muted focus:outline-none"
                                    />
                                </div>
                            </div>
                            {tree.selectionBar}
                        </>
                    ) : (
                        <NavItem
                            to="/connections"
                            icon={Plug2}
                            label={t('sidebar.connections')}
                            isConnected={!!activeConnectionId}
                        />
                    )}

                    {/* Open connections, or in tree mode every saved one */}
                    {(treeMode ? true : openConnections.length > 0) && (
                        <div
                            className={clsx(
                                'w-full flex flex-col items-center mt-2 pt-2 border-t border-default',
                                treeMode && 'flex-1 min-h-0 overflow-y-auto px-1',
                            )}
                        >
                            {/* Show group item once if there is a split view */}
                            {splitView && (
                                <div ref={groupRef} className="w-full">
                                    <ConnectionGroupItem
                                        connections={openConnections.filter((c) =>
                                            isConnectionGrouped(c.id, splitView),
                                        )}
                                        mode={splitView.mode}
                                        isDropTarget={isGroupDropTarget}
                                    />
                                </div>
                            )}

                            {sidebarFolders ? (
                                <>
                                    {sidebarFolders.folders
                                        .filter(
                                            (folder) =>
                                                isSearching ||
                                                !folder.ancestorIds.some((id) =>
                                                    collapsedFolders.has(id),
                                                ),
                                        )
                                        .map((folder) => (
                                            <ConnectionGroupFolder
                                                key={folder.group.id}
                                                name={folder.group.name}
                                                path={folder.path}
                                                count={folder.connections.length}
                                                depth={folder.ancestorIds.length}
                                                onContextMenu={(e) =>
                                                    tree.openMenu(e, tree.folderItems(folder.group))
                                                }
                                                groupId={folder.group.id}
                                                onHeaderMouseDown={(e) =>
                                                    drag.startGroupDrag(
                                                        e,
                                                        folder.group.id,
                                                        folder.group.name,
                                                    )
                                                }
                                                dropPosition={
                                                    drag.groupDrop?.id === folder.group.id
                                                        ? drag.groupDrop.position
                                                        : null
                                                }
                                                isDragOver={
                                                    drag.dragOverGroupId === folder.group.id
                                                }
                                                // A search shows its matches even in collapsed folders.
                                                isCollapsed={
                                                    !isSearching &&
                                                    collapsedFolders.has(folder.group.id)
                                                }
                                                hasActiveConnection={
                                                    isEditorRoute(location.pathname) &&
                                                    folder.connections.some((c) => c.isActive)
                                                }
                                                onToggle={() =>
                                                    void toggleGroupCollapsed(folder.group.id)
                                                }
                                            >
                                                {folder.connections.map((conn) =>
                                                    renderRailConnection(
                                                        conn,
                                                        folder.ancestorIds.length + 1,
                                                    ),
                                                )}
                                            </ConnectionGroupFolder>
                                        ))}
                                    {sidebarFolders.ungrouped.map((conn) =>
                                        renderRailConnection(conn),
                                    )}
                                </>
                            ) : (
                                sortedSidebarConnections.map((conn) => renderRailConnection(conn))
                            )}
                        </div>
                    )}
                </nav>

                <div
                    className={treeMode ? 'pt-2 flex items-start justify-center gap-1' : 'mt-auto'}
                >
                    <div className="relative mb-2">
                        <button
                            onClick={() => void platform.openExternalUrl(DISCORD_URL)}
                            className="flex items-center justify-center w-12 h-12 rounded-lg transition-colors relative group text-secondary hover:bg-surface-secondary hover:text-accent"
                        >
                            <RailIndicator isActive={false} className="-left-2" />
                            <div className="relative">
                                <DiscordIcon size={24} />
                            </div>
                            <span className="absolute left-14 bg-surface-secondary text-primary text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                                Discord
                            </span>
                        </button>
                        <DiscordCommunityCallout />
                    </div>

                    <NavItem to="/mcp" icon={Cpu} label={t('sidebar.mcpServer')} />

                    <NavItem
                        to="/settings"
                        icon={Settings}
                        label={t('sidebar.settings')}
                        tooltip={updates.summary}
                        badge={
                            // One aggregated counter on the rail; the Settings navigation
                            // splits it into core (Info) and plugin (Plugins) counts.
                            <UpdateBadge
                                count={updates.totalCount}
                                tooltip={updates.summary}
                                className="absolute -right-1 -top-1"
                            />
                        }
                    />

                    <SlotAnchor
                        name="sidebar.footer.actions"
                        context={{
                            connectionId: activeConnectionId,
                            driver: activeDriver,
                        }}
                        className="flex flex-col items-center gap-1 mt-1"
                    />
                </div>
            </aside>

            {/* Secondary Sidebar (Schema Explorer) */}
            {shouldShowExplorer && !isExplorerCollapsed && explorerConnId && (
                <PanelDatabaseProvider connectionId={explorerConnId}>
                    <Suspense
                        fallback={
                            <div style={{width: sidebarWidth}}>
                                <LoadingState />
                            </div>
                        }
                    >
                        <ExplorerSidebar
                            sidebarWidth={sidebarWidth}
                            startResize={startResize}
                            onCollapse={() => setIsExplorerCollapsed(true)}
                            sidebarTab={sidebarTab}
                            onSidebarTabChange={setSidebarTab}
                        />
                    </Suspense>
                </PanelDatabaseProvider>
            )}

            {/* Collapsed Explorer (Icon strip) */}
            {shouldShowExplorer && isExplorerCollapsed && (
                <div className="w-12 bg-base border-r border-default flex flex-col items-center py-2 gap-1">
                    <button
                        onClick={() => setIsExplorerCollapsed(false)}
                        className="text-muted hover:text-secondary hover:bg-surface-secondary rounded-lg p-2 transition-colors group relative"
                        title={t('sidebar.expandExplorer')}
                    >
                        <PanelLeft size={18} />
                        <span className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface-secondary text-primary text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                            {t('sidebar.expandExplorer')}
                        </span>
                    </button>
                    <div className="w-6 h-px bg-default my-1" />
                    {[
                        {
                            id: 'structure' as SidebarTab,
                            icon: Layers,
                            label: t('sidebar.structure'),
                        },
                        {
                            id: 'favorites' as SidebarTab,
                            icon: Star,
                            label: t('sidebar.favorites'),
                        },
                        {
                            id: 'history' as SidebarTab,
                            icon: Clock,
                            label: t('sidebar.queryHistory'),
                        },
                        {
                            id: 'notebooks' as SidebarTab,
                            icon: BookOpen,
                            label: t('sidebar.notebooks.tab'),
                        },
                        {
                            id: 'sqlFiles' as SidebarTab,
                            icon: FolderTree,
                            label: t('linkedFolders.tab'),
                        },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setSidebarTab(tab.id);
                                setIsExplorerCollapsed(false);
                            }}
                            className={`rounded-lg p-2 transition-colors group relative ${
                                sidebarTab === tab.id
                                    ? 'text-accent bg-accent-primary/10'
                                    : 'text-muted hover:text-secondary hover:bg-surface-secondary'
                            }`}
                            title={tab.label}
                        >
                            <tab.icon size={16} />
                            <span className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface-secondary text-primary text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                                {tab.label}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {treeMode && tree.dialogs}
        </div>
    );
};
