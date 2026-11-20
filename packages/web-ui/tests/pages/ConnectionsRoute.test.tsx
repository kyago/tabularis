import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConnectionsRoute} from '@/pages/ConnectionsRoute';

const settings = vi.hoisted(() => ({groupSidebarConnectionsByFolder: false as boolean}));
const restore = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useRestoreLastSession', () => ({useRestoreLastSession: restore}));
vi.mock('lucide-react', async () => await vi.importActual('lucide-react'));
vi.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}));
vi.mock('@/hooks/useSettings', () => ({useSettings: () => ({settings})}));
vi.mock('@/pages/Connections', () => ({Connections: () => <div>connections page</div>}));

const renderAt = (url: string) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <ConnectionsRoute />
        </MemoryRouter>,
    );

describe('ConnectionsRoute', () => {
    beforeEach(() => {
        settings.groupSidebarConnectionsByFolder = false;
        restore.mockClear();
    });

    it('shows the Connections page while the sidebar tree is off', () => {
        renderAt('/connections');
        expect(screen.getByText('connections page')).toBeInTheDocument();
    });

    it('replaces the page with a hint when the sidebar tree manages connections', () => {
        settings.groupSidebarConnectionsByFolder = true;
        renderAt('/connections');
        expect(screen.queryByText('connections page')).not.toBeInTheDocument();
        expect(screen.getByText('sidebar.noOpenConnection')).toBeInTheDocument();
        // The page reopened last session's connections on start; its stand-in must too.
        expect(restore).toHaveBeenCalled();
    });

    it('explains a connection link that could not be opened', () => {
        settings.groupSidebarConnectionsByFolder = true;
        render(
            <MemoryRouter
                initialEntries={[{pathname: '/connections', state: {connectionLinkError: 'gone'}}]}
            >
                <ConnectionsRoute />
            </MemoryRouter>,
        );
        expect(screen.getByRole('alert')).toHaveTextContent('gone');
    });
});
