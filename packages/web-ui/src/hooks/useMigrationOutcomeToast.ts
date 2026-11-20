import {useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import type {
    BuiltinDriverMigrationState,
    MigrationOutcome,
} from '@/hooks/useBuiltinDriverMigration';
import {usePlatformCapabilities} from '@/hooks/usePlatformCapabilities';
import {useToast} from '@/hooks/useToast';
import type {PluginManifest} from '@/types/plugins';
import {buildPluginIssueUrl, resolvePluginRepoUrl} from '@/utils/pluginIssueReport';
import {APP_VERSION} from '@/version';

interface Options {
    migration: Pick<BuiltinDriverMigrationState, 'builtinId' | 'pluginId' | 'undoMigration'>;
    catalogueRegistry: ReadonlyArray<{
        id: string;
        repo_url?: string | null;
        installed_version?: string | null;
    }>;
    installedPlugins: ReadonlyArray<Pick<PluginManifest, 'id' | 'version'>>;
}

// Surface the migration outcome as a toast per the design's post-migration
// spec: success gets an Undo action; failures (connection- or process-level)
// get both Undo and Report an issue. The toast is the courtesy nudge, not
// the only way back — the per-connection action stays bidirectional even
// after this toast is dismissed.
//
// Called directly where migrateConnection resolves (in handleMigrate's
// onConfirm below), not from a useEffect watching a "lastOutcome" piece of
// hook state — `migrateConnection` already resolves with the outcome, so
// routing it through state just to re-derive a toast from it on the next
// render violated .rules/react.md #2 (no synchronous setState-in-effect)
// for no benefit. It also meant every migrateConnection call anywhere —
// including MigrationChecklistModal's bulk "Migrate N selected" loop,
// which has its own per-row status UI — set that same shared state and
// fired this toast a second time on top of the checklist's own feedback.
export function useMigrationOutcomeToast({
    migration,
    catalogueRegistry,
    installedPlugins,
}: Options) {
    const {t} = useTranslation();
    const platform = usePlatformCapabilities();
    const {showToast} = useToast();
    const {builtinId, pluginId: defaultPluginId, undoMigration} = migration;
    return useCallback(
        (outcome: MigrationOutcome) => {
            const handleUndo = () => {
                void undoMigration(outcome.connectionId).then((result) => {
                    if (!result.ok) {
                        showToast(
                            t('migration.toast.undoFailed', {
                                name: outcome.connectionName,
                                error: result.error ?? 'unknown error',
                            }),
                            {kind: 'error', duration: 0},
                        );
                    }
                });
            };

            const handleReportIssue = (failureMode: 'connection' | 'process') => {
                const pluginId = outcome.pluginId ?? defaultPluginId;
                const registryEntry = catalogueRegistry.find((p) => p.id === pluginId);
                const repoUrl = resolvePluginRepoUrl(pluginId, registryEntry?.repo_url);
                if (!repoUrl) {
                    // No registry entry and no known fallback — nothing to link to; the
                    // toast action simply has nowhere to send the user.
                    return;
                }
                const installed = installedPlugins.find((p) => p.id === pluginId);
                const url = buildPluginIssueUrl({
                    pluginId,
                    pluginVersion:
                        installed?.version ?? registryEntry?.installed_version ?? 'unknown',
                    repoUrl,
                    appVersion: APP_VERSION,
                    os: navigator.platform,
                    template: 'migration-failure',
                    failureMode,
                    error: outcome.error ?? outcome.startupError ?? 'unknown error',
                    migratedFromDriver: builtinId,
                });
                void platform.openExternalUrl(url);
            };

            if (outcome.status === 'ok') {
                showToast(t('migration.toast.success', {name: outcome.connectionName}), {
                    kind: 'success',
                    duration: 0,
                    actions: [{label: t('migration.toast.undo'), onClick: handleUndo}],
                });
            } else if (outcome.status === 'connection' && outcome.preexisting) {
                // The built-in driver couldn't reach this host either — not a
                // plugin regression, so no "Report an issue" action.
                showToast(
                    t('migration.toast.connectionFailurePreexisting', {
                        name: outcome.connectionName,
                        error: outcome.error,
                    }),
                    {
                        kind: 'warning',
                        duration: 0,
                        actions: [{label: t('migration.toast.undo'), onClick: handleUndo}],
                    },
                );
            } else if (outcome.status === 'connection') {
                showToast(
                    t('migration.toast.connectionFailure', {
                        name: outcome.connectionName,
                        error: outcome.error,
                    }),
                    {
                        kind: 'error',
                        duration: 0,
                        actions: [
                            {label: t('migration.toast.undo'), onClick: handleUndo},
                            {
                                label: t('migration.toast.reportIssue'),
                                onClick: () => handleReportIssue('connection'),
                            },
                        ],
                    },
                );
            } else if (outcome.status === 'process') {
                showToast(
                    outcome.startupError
                        ? t('migration.toast.processFailureWithError', {
                              name: outcome.connectionName,
                              error: outcome.startupError,
                          })
                        : t('migration.toast.processFailure', {name: outcome.connectionName}),
                    {
                        kind: 'error',
                        duration: 0,
                        actions: [
                            {label: t('migration.toast.undo'), onClick: handleUndo},
                            {
                                label: t('migration.toast.reportIssue'),
                                onClick: () => handleReportIssue('process'),
                            },
                        ],
                    },
                );
            } else {
                // status === "failed": something unexpected happened before the driver
                // flip could even be confirmed (e.g. the connection vanished
                // concurrently, or the write itself errored) — Undo is still offered
                // since flipping back to the built-in driver is safe either way.
                showToast(
                    t('migration.toast.failed', {
                        name: outcome.connectionName,
                        error: outcome.error ?? 'unknown error',
                    }),
                    {
                        kind: 'error',
                        duration: 0,
                        actions: [{label: t('migration.toast.undo'), onClick: handleUndo}],
                    },
                );
            }
        },
        [
            builtinId,
            defaultPluginId,
            undoMigration,
            catalogueRegistry,
            installedPlugins,
            platform,
            showToast,
            t,
        ],
    );
}
