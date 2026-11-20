import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {describe, expect, it, vi} from 'vitest';
import {useConnectionTreeActions} from '@/components/layout/sidebar/useConnectionTreeActions';
import type {ConnectionGroup, SavedConnection} from '@/contexts/DatabaseContext';

const groups: ConnectionGroup[] = [
    {id: 'apps', name: 'APPS', collapsed: false, sort_order: 0},
    {id: 'ops', name: 'OPS', collapsed: false, sort_order: 1},
];
const conn = {
    id: 'c1',
    name: 'Orders DEV',
    group_id: 'apps',
    sort_order: 0,
    params: {driver: 'postgres'},
} as SavedConnection;
const other = {...conn, id: 'c2', name: 'Billing DEV', group_id: 'ops', sort_order: 4};

const db = vi.hoisted(() => ({
    loadConnections: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnectionOpenAnywhere: vi.fn(() => true),
    moveConnectionToGroup: vi.fn().mockResolvedValue(undefined),
    createGroupPath: vi.fn().mockResolvedValue(undefined),
    updateGroup: vi.fn().mockResolvedValue(undefined),
    deleteGroup: vi.fn().mockResolvedValue(undefined),
}));
const call = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('lucide-react', async () => await vi.importActual('lucide-react'));
vi.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}));
vi.mock('@/hooks/useDatabase', () => ({
    useDatabase: () => ({...db, connections: [conn, other], connectionGroups: groups}),
}));
vi.mock('@/hooks/useTabularisClient', () => ({useTabularisClient: () => ({call})}));
vi.mock('@/hooks/useAlert', () => ({useAlert: () => ({showAlert: vi.fn()})}));
vi.mock('@/hooks/useToast', () => ({useToast: () => ({showToast: vi.fn()})}));
vi.mock('@/hooks/usePlatformCapabilities', () => ({usePlatformCapabilities: () => ({})}));
vi.mock('@/hooks/useDrivers', () => ({
    useDrivers: () => ({allDrivers: [], installedPlugins: []}),
}));
vi.mock('@/hooks/useConnectionCatalogue', () => ({
    useConnectionCatalogue: () => ({registry: []}),
}));
vi.mock('@/hooks/useCreateSqliteDatabase', () => ({
    useCreateSqliteDatabase: () => ({createSqliteDatabase: vi.fn()}),
}));
vi.mock('@/hooks/useBuiltinDriverMigration', () => ({
    useBuiltinPostgresMigration: () => ({
        builtinId: 'postgres',
        pluginId: 'postgresql',
        builtinConnections: [],
        migrateConnection: vi.fn(),
        undoMigration: vi.fn(),
    }),
}));
vi.mock('@/hooks/useMigrationOutcomeToast', () => ({useMigrationOutcomeToast: () => vi.fn()}));
vi.mock('@/utils/connectionFiles', () => ({saveGeneratedFile: vi.fn()}));

let actions!: ReturnType<typeof useConnectionTreeActions>;
const Harness = () => {
    actions = useConnectionTreeActions({connect: vi.fn()});
    return (
        <>
            {actions.selectionBar}
            {actions.dialogs}
        </>
    );
};
const mount = () =>
    render(
        <MemoryRouter>
            <Harness />
        </MemoryRouter>,
    );
const item = (label: string) => {
    const found = actions.connectionItems(conn).find((entry) => entry.label === label);
    if (!found) throw new Error(`no menu item ${label}`);
    return found;
};

describe('useConnectionTreeActions', () => {
    it('offers the Connections page actions for a connection', () => {
        mount();
        expect(
            actions
                .connectionItems(conn)
                .filter((entry) => !entry.separator)
                .map((entry) => entry.label),
        ).toEqual([
            'connections.edit',
            'connections.duplicate',
            'groups.moveToGroup',
            'groups.removeFromGroup',
            'connections.delete',
        ]);
        // The folder it already lives in is not a move target.
        expect(item('groups.moveToGroup').submenu?.map((entry) => entry.label)).toEqual(['OPS']);
    });

    it('moves a connection to the end of the target folder', async () => {
        mount();
        await act(async () => item('groups.moveToGroup').submenu?.[0].action?.());
        expect(db.moveConnectionToGroup).toHaveBeenCalledWith('c1', 'ops', 5);
    });

    it('deletes only after confirmation, closing the connection first', async () => {
        mount();
        act(() => item('connections.delete').action?.());
        expect(call).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', {name: 'common.delete'}));

        await waitFor(() => expect(call).toHaveBeenCalledWith('delete_connection', {id: 'c1'}));
        expect(db.disconnect).toHaveBeenCalledWith('c1');
        expect(db.loadConnections).toHaveBeenCalled();
    });

    it('keeps "add connection" on its own button, out of the more menu', () => {
        mount();
        expect(actions.rootItems.map((entry) => entry.label)).not.toContain(
            'connections.addConnection',
        );
    });

    it('deletes and exports the picked connections in selection mode', async () => {
        mount();
        expect(actions.selected).toBeNull();
        act(() =>
            actions.rootItems
                .find((entry) => entry.label === 'sidebar.selectConnections')
                ?.action?.(),
        );
        act(() => actions.toggleSelected('c2'));
        expect([...(actions.selected ?? [])]).toEqual(['c2']);

        call.mockClear();
        fireEvent.click(screen.getByRole('button', {name: 'connections.deleteSelected'}));
        fireEvent.click(screen.getByRole('button', {name: 'common.delete'}));
        await waitFor(() => expect(call).toHaveBeenCalledWith('delete_connection', {id: 'c2'}));
        expect(call).not.toHaveBeenCalledWith('delete_connection', {id: 'c1'});
        await waitFor(() => expect(actions.selected?.size).toBe(0));
    });

    it('creates a folder from the typed name', async () => {
        mount();
        act(() => actions.rootItems.find((entry) => entry.label === 'groups.newGroup')?.action?.());
        fireEvent.change(screen.getByRole('textbox'), {target: {value: ' team/dev '}});
        fireEvent.keyDown(screen.getByRole('textbox'), {key: 'Enter'});

        await waitFor(() => expect(db.createGroupPath).toHaveBeenCalledWith('team/dev', null));
    });
});
