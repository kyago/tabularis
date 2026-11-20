import {useState} from 'react';
import {useDatabase} from '@/hooks/useDatabase';
import {inSavedOrder} from '@/utils/connectionManager';
import {
    connectionDropZone,
    connectionOrderAfterMove,
    groupDropZone,
    planGroupDrop,
    type ConnectionDropPosition,
    type GroupDropPosition,
} from '@/utils/connections';
import {startPointerDrag} from '@/utils/pointerDrag';

/** Row markers the drag reads from the DOM, set by the tree's rows. */
export const CONNECTION_ROW_ATTR = 'data-connection-id';
export const GROUP_ATTR = 'data-group-id';
export const GROUP_HEADER_ATTR = 'data-group-header-id';

// The drag overlay sits on top, so look through every element under the pointer.
function targetAt(x: number, y: number, attr: string): HTMLElement | null {
    for (const el of document.elementsFromPoint(x, y)) {
        const hit = el.closest<HTMLElement>(`[${attr}]`);
        if (hit) return hit;
    }
    return null;
}

function ghost(label: string) {
    return () => {
        const el = document.createElement('div');
        el.className =
            'px-2 py-1 rounded text-xs bg-surface-secondary text-primary border border-default shadow-lg';
        el.textContent = label;
        return el;
    };
}

interface Options {
    /** Off while the tree is filtered or in selection mode: positions would mislead. */
    enabled: boolean;
    onError: (error: unknown) => void;
    /** An expanded folder with rows under it; dropping "after" it would land far below. */
    hasVisibleContent: (groupId: string) => boolean;
}

/**
 * Reordering by drag in the sidebar tree, with the Connections page's rules:
 * a connection drops before/after another connection or into a folder; a
 * folder drops before/after/inside another folder.
 */
export function useConnectionTreeDrag({enabled, onError, hasVisibleContent}: Options) {
    const {
        connections,
        connectionGroups,
        loadConnections,
        moveConnectionToGroup,
        reorderConnectionsInGroup,
        moveGroupToParent,
        reorderGroups,
    } = useDatabase();
    const [connectionDrop, setConnectionDrop] = useState<{
        id: string;
        position: ConnectionDropPosition;
    } | null>(null);
    const [groupDrop, setGroupDrop] = useState<{id: string; position: GroupDropPosition} | null>(
        null,
    );
    const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

    const apply = (change: () => Promise<unknown>) =>
        void change()
            .then(() => loadConnections())
            .catch(onError);

    const startConnectionDrag = (e: React.MouseEvent, connectionId: string, name: string) => {
        if (!enabled || e.button !== 0 || e.ctrlKey || e.metaKey) return;
        const source = connections.find((c) => c.id === connectionId);
        if (!source) return;
        const sourceGroupId = source.group_id ?? null;

        const dropAt = (x: number, y: number) => {
            const row = targetAt(x, y, CONNECTION_ROW_ATTR);
            const id = row?.getAttribute(CONNECTION_ROW_ATTR);
            if (row && id && id !== connectionId) {
                return {
                    connection: {
                        id,
                        position: connectionDropZone(row.getBoundingClientRect(), x, y, 'y'),
                    },
                    groupId: null,
                };
            }
            const groupId = targetAt(x, y, GROUP_ATTR)?.getAttribute(GROUP_ATTR) ?? null;
            return {connection: null, groupId: groupId === sourceGroupId ? null : groupId};
        };

        startPointerDrag(e.clientX, e.clientY, {
            threshold: 5,
            createGhost: ghost(name),
            onDragMove: (x, y) => {
                const {connection, groupId} = dropAt(x, y);
                setConnectionDrop((prev) =>
                    prev?.id === connection?.id && prev?.position === connection?.position
                        ? prev
                        : connection,
                );
                setDragOverGroupId(groupId);
            },
            onDrop: (x, y) => {
                const {connection, groupId} = dropAt(x, y);
                if (connection) {
                    const target = connections.find((c) => c.id === connection.id);
                    if (!target) return;
                    const targetGroupId = target.group_id ?? null;
                    const siblings = inSavedOrder(
                        connections.filter((c) => (c.group_id ?? null) === targetGroupId),
                        connections,
                    );
                    const order = connectionOrderAfterMove(
                        siblings.map((c) => c.id),
                        connectionId,
                        connection.id,
                        connection.position,
                    );
                    if (!order) return;
                    apply(async () => {
                        if (sourceGroupId !== targetGroupId) {
                            const slot = order.find(([id]) => id === connectionId)?.[1];
                            await moveConnectionToGroup(connectionId, targetGroupId, slot);
                        }
                        await reorderConnectionsInGroup(order);
                    });
                } else if (groupId) {
                    const last = Math.max(
                        -1,
                        ...connections
                            .filter((c) => c.group_id === groupId)
                            .map((c) => c.sort_order ?? -1),
                    );
                    apply(() => moveConnectionToGroup(connectionId, groupId, last + 1));
                }
            },
            onEnd: () => {
                setConnectionDrop(null);
                setDragOverGroupId(null);
            },
        });
    };

    const startGroupDrag = (e: React.MouseEvent, groupId: string, name: string) => {
        if (!enabled || e.button !== 0) return;

        const dropAt = (x: number, y: number) => {
            const header = targetAt(x, y, GROUP_HEADER_ATTR);
            const id = header?.getAttribute(GROUP_HEADER_ATTR);
            if (!header || !id || id === groupId) return null;
            return {
                id,
                position: groupDropZone(header.getBoundingClientRect(), y, !hasVisibleContent(id)),
            };
        };

        startPointerDrag(e.clientX, e.clientY, {
            threshold: 5,
            createGhost: ghost(name),
            onDragMove: (x, y) => {
                const next = dropAt(x, y);
                setGroupDrop((prev) =>
                    prev?.id === next?.id && prev?.position === next?.position ? prev : next,
                );
            },
            onDrop: (x, y) => {
                const drop = dropAt(x, y);
                if (!drop) return;
                const plan = planGroupDrop(connectionGroups, groupId, drop.id, drop.position);
                if (!plan) return;
                if (plan === 'cycle') {
                    onError('Cannot move a group into one of its own subfolders');
                    return;
                }
                const source = connectionGroups.find((g) => g.id === groupId);
                apply(async () => {
                    if ((source?.parent_id ?? null) !== plan.parentId) {
                        await moveGroupToParent(groupId, plan.parentId);
                    }
                    await reorderGroups(plan.order);
                });
            },
            onEnd: () => setGroupDrop(null),
        });
    };

    return {connectionDrop, groupDrop, dragOverGroupId, startConnectionDrag, startGroupDrag};
}
