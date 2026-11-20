import {useLocation} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {Plug2} from 'lucide-react';
import {useRestoreLastSession} from '@/hooks/useRestoreLastSession';
import {useSettings} from '@/hooks/useSettings';
import type {ConnectionsRouteState} from '@/routing';
import {Connections} from './Connections';

/** Stands in for the Connections page while the sidebar tree manages connections. */
const NoOpenConnection = () => {
    const {t} = useTranslation();
    const location = useLocation();
    useRestoreLastSession();

    const linkError = (location.state as ConnectionsRouteState | null)?.connectionLinkError;
    return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-muted">
            <Plug2 size={32} aria-hidden="true" />
            <p className="text-sm">{t('sidebar.noOpenConnection')}</p>
            {linkError !== undefined && (
                <p role="alert" className="text-sm text-accent-error max-w-md text-center">
                    {t('connections.linkUnavailable')}: {linkError}
                </p>
            )}
        </div>
    );
};

export const ConnectionsRoute = () => {
    const {settings} = useSettings();
    return settings.groupSidebarConnectionsByFolder === true ? (
        <NoOpenConnection />
    ) : (
        <Connections />
    );
};
