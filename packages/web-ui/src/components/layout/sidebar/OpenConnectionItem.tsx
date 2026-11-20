import {useState} from 'react';
import {useLocation} from 'react-router-dom';
import {
    Loader2,
    Shield,
    X,
    AlertCircle,
    Terminal,
    Check,
    Copy,
    Power,
    Columns2,
    Rows2,
    AppWindow,
    SquarePlus,
    Square,
    CheckSquare,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import clsx from 'clsx';
import type {ConnectionStatus} from '@/hooks/useConnectionManager';
import {getConnectionItemClass, getStatusDotClass} from '@/utils/connectionManager';
import {canActivateSplit, canAddToSplit} from '@/utils/connectionLayout';
import {useConnectionLayoutContext} from '@/hooks/useConnectionLayoutContext';
import {ContextMenu, type ContextMenuItem} from '@/components/ui/ContextMenu';
import {RailIndicator} from './RailIndicator';
import type {PluginManifest} from '@/types/plugins';
import {getConnectionAccent, getConnectionIcon} from '@/utils/driverUI';
import {useDatabase} from '@/hooks/useDatabase';
import {isEditorRoute} from '@/routing';

interface Props {
    connection: ConnectionStatus;
    driverManifest?: PluginManifest | null;
    isSelected: boolean;
    onSwitch: () => void;
    /** Opens a closed connection (row layout lists those too). */
    onConnect?: () => void;
    onOpenInEditor: () => void;
    onOpenInNewWindow: () => void;
    onDisconnect: () => void;
    onToggleSelect: (isCtrlHeld: boolean) => void;
    selectedConnectionIds: Set<string>;
    onActivateSplit: (mode: 'vertical' | 'horizontal') => void;
    shortcutIndex?: number;
    showShortcutHint?: boolean;
    /** Starts a pointer-based drag session (reorder / drop into split group) */
    onMoveMouseDown?: (e: React.MouseEvent) => void;
    dropIndicator?: 'above' | 'below' | null;
    /** 'row' shows the name as text in the connection tree; default is the icon rail. */
    layout?: 'icon' | 'row';
    /** Nesting level in the tree, for indentation. */
    depth?: number;
    /** Extra menu items (edit, move, delete...) appended to the context menu. */
    manageItems?: ContextMenuItem[];
    /** Selection mode: defined while it is on, and a click then toggles this row. */
    checked?: boolean;
    onToggleChecked?: () => void;
    /** Row layout: shows a chevron that expands the connection's console list. */
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    /** Tag colors shown as dots after the name (names go in the tooltip). */
    tags?: ReadonlyArray<{id: string; name: string; color: string}>;
}

export const OpenConnectionItem = ({
    connection,
    driverManifest,
    isSelected,
    onSwitch,
    onConnect,
    onOpenInEditor,
    onOpenInNewWindow,
    onDisconnect,
    onToggleSelect,
    selectedConnectionIds,
    onActivateSplit,
    shortcutIndex,
    showShortcutHint = false,
    onMoveMouseDown,
    dropIndicator = null,
    layout = 'icon',
    depth = 0,
    manageItems = [],
    checked,
    onToggleChecked,
    isExpanded = false,
    onToggleExpand,
    tags = [],
}: Props) => {
    const {t} = useTranslation();
    const {connections} = useDatabase();
    const location = useLocation();
    const {isOpen, isActive, isConnecting, name, database, sshEnabled, error} = connection;
    // The rail indicator marks the current view: a connection "owns" it only in
    // the editor, otherwise it belongs to the active nav item (connections/mcp/settings)
    const isCurrentView = isActive && isEditorRoute(location.pathname);
    const savedConnection = connections.find((c) => c.id === connection.id);
    const driverColor = getConnectionAccent(savedConnection, driverManifest);
    const hasError = !!error;
    const canSplit = canActivateSplit(selectedConnectionIds);
    const {splitView, addConnectionToSplit} = useConnectionLayoutContext();
    const canJoinSplit = canAddToSplit(splitView, connection.id);

    const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({x: e.clientX, y: e.clientY});
    };

    const handleClick = (e: React.MouseEvent) => {
        if (checked !== undefined) {
            onToggleChecked?.();
        } else if (!isOpen) {
            onConnect?.();
        } else if (e.ctrlKey || e.metaKey) {
            onToggleSelect(true);
        } else {
            onSwitch();
        }
    };

    const splitItems = canSplit
        ? [
              {
                  label: t('sidebar.splitVertical'),
                  icon: Columns2,
                  action: () => onActivateSplit('vertical'),
              },
              {
                  label: t('sidebar.splitHorizontal'),
                  icon: Rows2,
                  action: () => onActivateSplit('horizontal'),
              },
              {separator: true as const},
          ]
        : [];

    const joinSplitItems = canJoinSplit
        ? [
              {
                  label: t('sidebar.addToSplitGroup'),
                  icon: SquarePlus,
                  action: () => addConnectionToSplit(connection.id),
              },
              {separator: true as const},
          ]
        : [];

    const copyNameItem = {
        label: t('sidebar.copyName'),
        icon: Copy,
        action: () => navigator.clipboard.writeText(name),
    };
    const closedMenuItems = [
        {label: t('connections.connect'), icon: Power, action: () => onConnect?.()},
        {separator: true as const},
        copyNameItem,
    ];
    const openMenuItems = [
        ...splitItems,
        ...joinSplitItems,
        {
            label: t('sidebar.openInEditor'),
            icon: Terminal,
            action: onOpenInEditor,
        },
        {
            label: t('sidebar.openInNewWindow'),
            icon: AppWindow,
            action: onOpenInNewWindow,
        },
        {
            label: t('sidebar.setAsActive'),
            icon: Check,
            action: onSwitch,
            disabled: isActive,
        },
        {separator: true as const},
        copyNameItem,
        {separator: true as const},
        {
            label: t('connections.disconnect'),
            icon: Power,
            action: onDisconnect,
            danger: true,
        },
    ];
    const menuItems = [
        ...(isOpen ? openMenuItems : closedMenuItems),
        ...(manageItems.length > 0 ? [{separator: true as const}, ...manageItems] : []),
    ];

    if (layout === 'row') {
        return (
            <>
                <div className="relative group w-full" data-connection-id={connection.id}>
                    {dropIndicator && (
                        <div
                            className={clsx(
                                'absolute left-2 right-2 h-0.5 bg-accent-primary rounded-full z-30 pointer-events-none',
                                dropIndicator === 'above' ? '-top-px' : '-bottom-px',
                            )}
                        />
                    )}
                    <RailIndicator isActive={isCurrentView} />
                    {onToggleExpand && (
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            aria-expanded={isExpanded}
                            aria-label={`${t('sidebar.consoles')}: ${name}`}
                            title={t('sidebar.consoles')}
                            style={{left: 4 + depth * 12}}
                            className="absolute top-1/2 -translate-y-1/2 z-10 w-4 h-4 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                        >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleClick}
                        onMouseDown={onMoveMouseDown}
                        onContextMenu={handleContextMenu}
                        aria-label={name}
                        aria-current={isCurrentView ? 'true' : undefined}
                        aria-pressed={checked}
                        title={[name, database, tags.map((tag) => tag.name).join(', '), error]
                            .filter(Boolean)
                            .join('\n')}
                        style={{paddingLeft: 8 + depth * 12 + (onToggleExpand ? 14 : 0)}}
                        className={clsx(
                            'w-full h-7 flex items-center gap-2 pr-6 rounded text-xs text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                            isSelected &&
                                'ring-1 ring-inset ring-accent-primary bg-accent-primary/20',
                            isCurrentView
                                ? 'bg-surface-secondary text-primary font-medium'
                                : isOpen
                                  ? 'text-primary hover:bg-surface-secondary'
                                  : 'text-muted hover:bg-surface-secondary hover:text-secondary',
                        )}
                    >
                        <span
                            className={clsx(
                                'relative shrink-0 w-5 h-5 rounded flex items-center justify-center text-white',
                                !isOpen && 'opacity-50',
                                savedConnection?.environment === 'production' &&
                                    'ring-2 ring-accent-error/70',
                            )}
                            style={{backgroundColor: driverColor}}
                        >
                            {isConnecting ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                getConnectionIcon(savedConnection, driverManifest, 12)
                            )}
                            {isOpen && !isConnecting && (
                                <span
                                    className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-elevated ${getStatusDotClass(isActive, hasError)}`}
                                />
                            )}
                        </span>
                        <span className="truncate flex-1">{name}</span>
                        {tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag.id}
                                className="shrink-0 w-1.5 h-1.5 rounded-full"
                                style={{backgroundColor: tag.color}}
                            />
                        ))}
                        {showShortcutHint && shortcutIndex !== undefined && (
                            <span className="shrink-0 text-[9px] font-bold text-accent">
                                {shortcutIndex}
                            </span>
                        )}
                    </button>
                    {checked !== undefined ? (
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-accent pointer-events-none">
                            {checked ? <CheckSquare size={12} /> : <Square size={12} />}
                        </span>
                    ) : (
                        isOpen && (
                            <button
                                type="button"
                                onClick={onDisconnect}
                                aria-label={t('connections.disconnect')}
                                title={t('connections.disconnect')}
                                className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-accent-error/20 hover:text-accent-error"
                            >
                                <X size={10} />
                            </button>
                        )
                    )}
                </div>

                {contextMenu && (
                    <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        items={menuItems}
                        onClose={() => setContextMenu(null)}
                    />
                )}
            </>
        );
    }

    return (
        <>
            <div className="relative group w-full flex flex-col items-center mb-1">
                {/* Drop indicator - above */}
                {dropIndicator === 'above' && (
                    <div className="absolute -top-0.5 left-2 right-2 h-0.5 bg-accent-primary rounded-full z-30" />
                )}

                <RailIndicator isActive={isCurrentView} />

                <button
                    onClick={handleClick}
                    onMouseDown={onMoveMouseDown}
                    onContextMenu={handleContextMenu}
                    className={`flex items-center justify-center w-12 h-12 rounded-lg transition-all relative ${
                        isSelected
                            ? 'ring-2 ring-accent-primary bg-accent-primary/20 text-accent'
                            : getConnectionItemClass(isActive)
                    }`}
                >
                    {isConnecting ? (
                        <Loader2 size={20} className="animate-spin text-accent" />
                    ) : (
                        <div
                            className="w-11 h-11 rounded-lg flex items-center justify-center text-white shadow-md"
                            style={{backgroundColor: driverColor}}
                        >
                            {getConnectionIcon(savedConnection, driverManifest, 20)}
                        </div>
                    )}

                    {/* Status dot */}
                    {!isConnecting && (
                        <div
                            className={`absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full border border-elevated ${getStatusDotClass(isActive, hasError)}`}
                        />
                    )}

                    {/* Production ring: unmistakable red outline around the icon */}
                    {savedConnection?.environment === 'production' && (
                        <div className="absolute inset-0.5 rounded-lg ring-2 ring-accent-error/70 pointer-events-none" />
                    )}

                    {/* SSH badge */}
                    {sshEnabled &&
                        !showShortcutHint &&
                        !connection.k8sEnabled &&
                        !connection.ssmEnabled && (
                            <div className="absolute top-1 right-1">
                                <Shield
                                    size={9}
                                    className="text-accent-success fill-accent-success/20"
                                />
                            </div>
                        )}

                    {/* K8s badge */}
                    {connection.k8sEnabled && !showShortcutHint && (
                        <div className="absolute top-1 right-1">
                            <Shield size={9} className="text-accent fill-accent-primary/20" />
                        </div>
                    )}

                    {/* AWS SSM badge */}
                    {connection.ssmEnabled && !connection.k8sEnabled && !showShortcutHint && (
                        <div className="absolute top-1 right-1">
                            <Shield
                                size={9}
                                className="text-accent-warning fill-accent-warning/20"
                            />
                        </div>
                    )}

                    {/* Shortcut hint badge */}
                    {showShortcutHint && shortcutIndex !== undefined && (
                        <div className="absolute -top-1 -left-1 w-4 h-4 bg-accent-primary rounded-full flex items-center justify-center text-inverse text-[9px] font-bold z-20 shadow-sm">
                            {shortcutIndex}
                        </div>
                    )}

                    {/* Error indicator */}
                    {hasError && !isConnecting && (
                        <div className="absolute -top-0.5 -left-0.5">
                            <AlertCircle size={12} className="text-accent-error" />
                        </div>
                    )}

                    {/* Selection indicator */}
                    {isSelected && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-accent-primary rounded-full flex items-center justify-center">
                            <Check size={8} className="text-white" />
                        </div>
                    )}
                </button>

                {/* Disconnect button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDisconnect();
                    }}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-elevated border border-default rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent-error/20 hover:text-accent-error text-muted z-10"
                    title={t('connections.disconnect')}
                >
                    <X size={8} />
                </button>

                {/* Tooltip */}
                <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface-secondary text-primary text-xs px-2 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none shadow-lg border border-default">
                    <div className="font-medium">{name}</div>
                    <div className="text-muted text-[10px]">{database}</div>
                    {isSelected && (
                        <div className="text-accent text-[10px] mt-0.5">
                            Selected (Ctrl+click to deselect)
                        </div>
                    )}
                    {hasError && (
                        <div className="text-accent-error text-[10px] mt-0.5 max-w-[180px] truncate">
                            {error}
                        </div>
                    )}
                </div>

                {/* Drop indicator - below */}
                {dropIndicator === 'below' && (
                    <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-accent-primary rounded-full z-30" />
                )}
            </div>

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={menuItems}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </>
    );
};
