import type {ReactNode} from 'react';
import clsx from 'clsx';
import {ChevronDown, ChevronRight, Folder, FolderOpen} from 'lucide-react';
import {RailIndicator} from './RailIndicator';

interface Props {
    name: string;
    path: string;
    count: number;
    isCollapsed: boolean;
    hasActiveConnection: boolean;
    onToggle: () => void;
    /** Nesting level, for indentation. */
    depth?: number;
    onContextMenu?: (e: React.MouseEvent) => void;
    /** Marks the folder and its header as drop targets for the tree's drag. */
    groupId?: string;
    onHeaderMouseDown?: (e: React.MouseEvent) => void;
    /** Where a dragged folder would land relative to this one. */
    dropPosition?: 'before' | 'after' | 'inside' | null;
    /** A dragged connection is over this folder. */
    isDragOver?: boolean;
    children: ReactNode;
}

/** A folder row of the sidebar connection tree. */
export const ConnectionGroupFolder = ({
    name,
    path,
    count,
    isCollapsed,
    hasActiveConnection,
    onToggle,
    depth = 0,
    onContextMenu,
    groupId,
    onHeaderMouseDown,
    dropPosition = null,
    isDragOver = false,
    children,
}: Props) => {
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    return (
        <div className="w-full flex flex-col" data-group-id={groupId}>
            <div className="relative group w-full" data-group-header-id={groupId}>
                {(dropPosition === 'before' || dropPosition === 'after') && (
                    <div
                        className={clsx(
                            'absolute left-2 right-2 h-0.5 bg-accent-primary rounded-full z-30 pointer-events-none',
                            dropPosition === 'before' ? '-top-px' : '-bottom-px',
                        )}
                    />
                )}
                <RailIndicator isActive={isCollapsed && hasActiveConnection} />
                <button
                    type="button"
                    onClick={onToggle}
                    onMouseDown={onHeaderMouseDown}
                    onContextMenu={onContextMenu}
                    aria-expanded={!isCollapsed}
                    aria-label={path}
                    title={path}
                    style={{paddingLeft: 8 + depth * 12}}
                    className={clsx(
                        'w-full h-7 flex items-center gap-1.5 pr-2 rounded text-xs font-medium text-secondary transition-colors hover:text-primary hover:bg-surface-secondary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                        (isDragOver || dropPosition === 'inside') &&
                            'ring-1 ring-inset ring-accent-primary bg-accent-primary/10',
                    )}
                >
                    <Chevron size={12} className="shrink-0 text-muted" />
                    {isCollapsed ? (
                        <Folder size={14} className="shrink-0 text-accent-warning/70" />
                    ) : (
                        <FolderOpen size={14} className="shrink-0 text-accent-warning" />
                    )}
                    <span className="truncate flex-1 text-left">{name}</span>
                    <span className="shrink-0 text-[10px] text-muted">{count}</span>
                </button>
            </div>

            {!isCollapsed && <div className="w-full flex flex-col">{children}</div>}
        </div>
    );
};
