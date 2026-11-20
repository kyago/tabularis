import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {describe, expect, it, vi} from 'vitest';
import {OpenConnectionItem} from '@/components/layout/sidebar/OpenConnectionItem';
import type {ConnectionStatus} from '@/utils/connectionManager';

vi.mock('lucide-react', async () => await vi.importActual('lucide-react'));
vi.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}));
vi.mock('@/hooks/useDatabase', () => ({useDatabase: () => ({connections: []})}));
vi.mock('@/hooks/useConnectionLayoutContext', () => ({
    useConnectionLayoutContext: () => ({splitView: null, addConnectionToSplit: vi.fn()}),
}));

const status = (overrides: Partial<ConnectionStatus> = {}): ConnectionStatus => ({
    id: 'c1',
    name: 'Orders DEV',
    driver: 'postgres',
    database: 'orders',
    sshEnabled: false,
    k8sEnabled: false,
    ssmEnabled: false,
    isOpen: true,
    isActive: false,
    isConnecting: false,
    isConnected: true,
    ...overrides,
});

const renderRow = (connection: ConnectionStatus) => {
    const handlers = {onSwitch: vi.fn(), onConnect: vi.fn(), onDisconnect: vi.fn()};
    render(
        <MemoryRouter>
            <OpenConnectionItem
                layout="row"
                connection={connection}
                isSelected={false}
                onOpenInEditor={vi.fn()}
                onOpenInNewWindow={vi.fn()}
                onToggleSelect={vi.fn()}
                selectedConnectionIds={new Set()}
                onActivateSplit={vi.fn()}
                {...handlers}
            />
        </MemoryRouter>,
    );
    return handlers;
};

describe('OpenConnectionItem row layout', () => {
    it('shows the name as text and switches to an open connection', () => {
        const handlers = renderRow(status());

        fireEvent.click(screen.getByRole('button', {name: 'Orders DEV'}));

        expect(handlers.onSwitch).toHaveBeenCalledOnce();
        expect(handlers.onConnect).not.toHaveBeenCalled();
        expect(screen.getByRole('button', {name: 'connections.disconnect'})).toBeInTheDocument();
    });

    it('connects a closed connection in place and offers no disconnect', () => {
        const handlers = renderRow(status({isOpen: false, isConnected: false}));

        fireEvent.click(screen.getByRole('button', {name: 'Orders DEV'}));

        expect(handlers.onConnect).toHaveBeenCalledOnce();
        expect(handlers.onSwitch).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', {name: 'connections.disconnect'}),
        ).not.toBeInTheDocument();
    });
});
