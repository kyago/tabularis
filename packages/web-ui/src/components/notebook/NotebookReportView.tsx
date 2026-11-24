import {useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {AlertTriangle, Loader2, Presentation} from 'lucide-react';
import {DataGrid} from '@/components/ui/DataGrid';
import {ErrorDisplay} from '@/components/ui/ErrorDisplay';
import {
    REPORT_GRID_COLUMNS,
    type NotebookCell,
    type NotebookParam,
    type RunAllResult,
} from '@/types/notebook';
import {isCellIncludedInReport, isCellOutputOutdated} from '@/utils/notebook';
import type {ParamDrafts} from '@/utils/notebookParams';
import {canRenderChart} from '@/utils/notebookChart';
import {reportSpanClass, spanFromDrag} from '@/utils/notebookReport';
import {CellChart} from './CellChart';
import {CellKpi} from './CellKpi';
import {MarkdownCell} from './MarkdownCell';
import {ParamsPanel} from './ParamsPanel';
import {RunAllSummary} from './RunAllSummary';

interface NotebookReportViewProps {
    cells: NotebookCell[];
    params: NotebookParam[];
    onParamsChange: (params: NotebookParam[]) => void;
    paramDrafts?: ParamDrafts;
    onParamDraftsChange?: (drafts: ParamDrafts) => void;
    typedParamsSupported?: boolean;
    runAllResult: RunAllResult | null;
    onDismissRunAllResult: () => void;
    onSwitchToEdit: () => void;
    outdatedCellIds?: ReadonlySet<string>;
    /** Omit to show tiles at full width without a resize handle. */
    onReportSpanChange?: (cellId: string, span: number) => void;
}

function ReportSqlCell({cell, paramsOutdated}: {cell: NotebookCell; paramsOutdated: boolean}) {
    const {t} = useTranslation();
    const outdated = isCellOutputOutdated(cell, paramsOutdated);
    const title = cell.name?.trim();
    const showKpi = !!cell.kpiConfig && (cell.isKpiVisible ?? !!cell.kpiConfig);
    const showChart =
        !!cell.result &&
        !!cell.chartConfig &&
        (cell.isChartVisible ?? !!cell.chartConfig) &&
        canRenderChart(cell.result);
    const height = cell.resultHeight ?? 300;

    const showHeader = Boolean(title || outdated || cell.result);

    return (
        <section
            aria-label={title || t('editor.notebook.sqlCell')}
            className="h-full bg-base border border-default rounded-lg overflow-hidden"
        >
            {showHeader && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-elevated border-b border-default flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                        {title && (
                            <h3 className="text-sm font-semibold text-primary truncate">{title}</h3>
                        )}
                        {outdated && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-accent-warning/15 text-accent-warning">
                                <AlertTriangle size={12} />
                                {t('editor.notebook.reportOutdated')}
                            </span>
                        )}
                    </div>
                    {cell.result && (
                        <span className="text-xs text-muted tabular-nums shrink-0">
                            {cell.cachedAt != null
                                ? t('editor.notebook.cachedAt', {
                                      time: new Date(cell.cachedAt).toLocaleString(),
                                  })
                                : t('editor.notebook.cellResult', {
                                      count: cell.result.rows.length,
                                      time: Math.round(cell.executionTime ?? 0),
                                  })}
                        </span>
                    )}
                </div>
            )}

            {cell.isLoading ? (
                <div className="flex items-center justify-center gap-2 p-6">
                    <Loader2 size={16} className="animate-spin text-accent" />
                    <span className="text-xs text-muted">{t('editor.executingQuery')}</span>
                </div>
            ) : cell.error ? (
                <div className="max-h-[200px] overflow-auto">
                    <ErrorDisplay error={cell.error} t={t} />
                </div>
            ) : !cell.result ? (
                <p className="px-4 py-6 text-xs text-muted italic text-center">
                    {t('editor.notebook.reportNoOutput')}
                </p>
            ) : (
                <div>
                    {showKpi && cell.kpiConfig && (
                        <CellKpi
                            result={cell.result}
                            error={cell.error}
                            config={cell.kpiConfig}
                            readOnly
                        />
                    )}
                    {showChart && cell.chartConfig && (
                        <CellChart result={cell.result} config={cell.chartConfig} readOnly />
                    )}
                    <div
                        style={{height}}
                        className="w-full overflow-hidden border-t border-default"
                    >
                        <DataGrid
                            columns={cell.result.columns}
                            data={cell.result.rows}
                            tableName={null}
                            pkColumns={null}
                            readonly
                        />
                    </div>
                </div>
            )}
        </section>
    );
}

interface ReportTileProps {
    span: number;
    label: string;
    onSpanChange?: (span: number) => void;
    children: ReactNode;
}

/** One cell's slot on the 6-column report grid, resized by dragging its right edge. */
function ReportTile({span, label, onSpanChange, children}: ReportTileProps) {
    const {t} = useTranslation();
    // Live span while dragging; saved once on release so undo sees one step.
    const [preview, setPreview] = useState<number | null>(null);
    const drag = useRef<{startX: number; columnWidth: number} | null>(null);
    const tileRef = useRef<HTMLDivElement>(null);
    const shown = preview ?? span;

    const commit = (next: number) => {
        if (next !== span) onSpanChange?.(next);
    };

    const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        const grid = tileRef.current?.parentElement;
        if (!grid) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = {
            startX: e.clientX,
            columnWidth: grid.getBoundingClientRect().width / REPORT_GRID_COLUMNS,
        };
        setPreview(span);
    };

    const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        setPreview(spanFromDrag(span, e.clientX - drag.current.startX, drag.current.columnWidth));
    };

    const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        const next = spanFromDrag(span, e.clientX - drag.current.startX, drag.current.columnWidth);
        drag.current = null;
        setPreview(null);
        commit(next);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        commit(Math.min(REPORT_GRID_COLUMNS, Math.max(1, span + step)));
    };

    return (
        <div ref={tileRef} className={`${reportSpanClass(shown)} relative min-w-0`}>
            {children}
            {onSpanChange && (
                <>
                    {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- a focusable separator is an ARIA widget (value + arrow keys), but jsx-a11y classifies every separator as static */}
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`${label}: ${t('editor.notebook.reportWidth')}`}
                        aria-valuenow={shown}
                        aria-valuemin={1}
                        aria-valuemax={REPORT_GRID_COLUMNS}
                        aria-valuetext={`${shown}/${REPORT_GRID_COLUMNS}`}
                        title={t('editor.notebook.reportWidth')}
                        tabIndex={0}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={() => {
                            drag.current = null;
                            setPreview(null);
                        }}
                        onKeyDown={handleKeyDown}
                        className={`hidden md:block absolute top-0 right-0 h-full w-2 rounded-r-lg cursor-col-resize touch-none hover:bg-accent-primary/30 focus-visible:bg-accent-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
                            preview !== null ? 'bg-accent-primary/40' : ''
                        }`}
                    />
                    {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
                </>
            )}
        </div>
    );
}

export function NotebookReportView({
    cells,
    params,
    onParamsChange,
    paramDrafts,
    onParamDraftsChange,
    typedParamsSupported,
    runAllResult,
    onDismissRunAllResult,
    onSwitchToEdit,
    outdatedCellIds,
    onReportSpanChange,
}: NotebookReportViewProps) {
    const {t} = useTranslation();
    const includedCells = cells.filter(isCellIncludedInReport);

    return (
        <div className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-7xl mx-auto w-full space-y-4">
                <ParamsPanel
                    params={params}
                    onParamsChange={onParamsChange}
                    drafts={paramDrafts}
                    onDraftsChange={onParamDraftsChange}
                    typedSupported={typedParamsSupported}
                />

                {runAllResult && (
                    <RunAllSummary result={runAllResult} onDismiss={onDismissRunAllResult} />
                )}

                {includedCells.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 border border-dashed border-default rounded-lg text-center">
                        <Presentation size={28} className="text-muted opacity-50" />
                        <p className="text-sm text-muted">{t('editor.notebook.reportEmpty')}</p>
                        <button
                            type="button"
                            onClick={onSwitchToEdit}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-surface-secondary text-primary hover:bg-surface-hover border border-strong transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                            {t('editor.notebook.editMode')}
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-6 gap-4">
                        {includedCells.map((cell) => (
                            <ReportTile
                                key={cell.id}
                                span={cell.reportSpan ?? REPORT_GRID_COLUMNS}
                                label={cell.name?.trim() || `#${cells.indexOf(cell) + 1}`}
                                onSpanChange={
                                    onReportSpanChange
                                        ? (span) => onReportSpanChange(cell.id, span)
                                        : undefined
                                }
                            >
                                {cell.type === 'markdown' ? (
                                    <MarkdownCell cell={cell} readOnly />
                                ) : (
                                    <ReportSqlCell
                                        cell={cell}
                                        paramsOutdated={!!outdatedCellIds?.has(cell.id)}
                                    />
                                )}
                            </ReportTile>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
