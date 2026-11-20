import {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {useDatabase} from '@/hooks/useDatabase';
import {usePlatformCapabilities} from '@/hooks/usePlatformCapabilities';
import {useSettings} from '@/hooks/useSettings';
import {useTabularisClient} from '@/hooks/useTabularisClient';
import {buildEditorRoute} from '@/routing';
import {restoreSession} from '@/utils/restoreSession';

let attempted = false;

/**
 * Reopens the connections that were open when the app last closed, once per
 * app run. Mounted by whatever stands at the connections route: the page, or
 * the hint that replaces it while the sidebar tree manages connections.
 */
export function useRestoreLastSession(onConnecting?: (connectionId: string | null) => void) {
    const client = useTabularisClient();
    const platform = usePlatformCapabilities();
    const {settings, isLoading: isSettingsLoading} = useSettings();
    const navigate = useNavigate();
    const {connections, connect, isConnectionOpen} = useDatabase();

    useEffect(() => {
        if (attempted) return;
        // Dedicated connection windows have their own URL-driven restore flow.
        // Browser sessions have no native windows; they behave like the main window.
        const windowLabel = platform.currentWindowLabel();
        if (windowLabel && windowLabel !== 'main') return;
        if (isSettingsLoading) return;
        if (connections.length === 0) return;
        if (settings.autoConnectLastConnection === false) return;
        attempted = true;
        void (async () => {
            try {
                const [openIds, activeId] = await Promise.all([
                    client.call('get_last_open_connections', undefined),
                    client.call('get_last_active_connection', undefined),
                ]);
                const toRestore = (openIds ?? []).filter(
                    (id) => connections.some((c) => c.id === id) && !isConnectionOpen(id),
                );
                if (toRestore.length === 0) return;
                let foregroundId: string | null = null;
                await restoreSession({
                    connectionIds: toRestore,
                    activeId,
                    connect,
                    onForegroundStart: (id) => {
                        foregroundId = id;
                        onConnecting?.(id);
                    },
                    onForegroundReady: () => {
                        onConnecting?.(null);
                        if (foregroundId) navigate(buildEditorRoute(foregroundId));
                    },
                    onError: (id, error) =>
                        console.error(`Auto-connect to connection ${id} failed:`, error),
                });
            } catch (e) {
                console.error('Auto-connect to last connections failed:', e);
            } finally {
                onConnecting?.(null);
            }
        })();
    }, [
        client,
        connections,
        settings.autoConnectLastConnection,
        isSettingsLoading,
        isConnectionOpen,
        connect,
        navigate,
        platform,
        onConnecting,
    ]);
}
