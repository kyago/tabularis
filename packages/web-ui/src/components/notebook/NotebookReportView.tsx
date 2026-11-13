import {useRef, useState, type KeyboardEvent, type PointerEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {Play} from 'lucide-react';
import {DataGrid} from '@/components/ui/DataGrid';
import {ErrorDisplay} from '@/components/ui/ErrorDisplay';
import {REPORT_GRID_COLUMNS, type NotebookCell, type NotebookParam} from '@/types/notebook';
import {
    reportCells,
    reportSpanClass,
    reportTileContent,
    spanFromDrag,
} from '@/utils/notebookReport';
import {CellChart} from './CellChart';
import {MarkdownPreview} from './MarkdownCell';
import {ParamsPanel} from './ParamsPanel';

interface NotebookReportViewProps {
    cells: NotebookCell[];
    params: NotebookParam[];
    onParamsChange: (params: NotebookParam[]) => void;
    onRunAll: () => void;
    onReportSpanChange: (cellId: string, span: number) => void;
    isRunning: boolean;
}

function TileBody({cell}: {cell: NotebookCell}) {
    const {t} = useTranslation();
    const height = cell.resultHeight ?? 300;

    switch (reportTileContent(cell)) {
        case 'markdown':
            return <MarkdownPreview content={cell.content} />;
        case 'chart':
            return <CellChart result={cell.result!} config={cell.chartConfig!} height={height} />;
        case 'table':
            return (
                <div style={{height}} className="overflow-hidden">
                    <DataGrid
                        columns={cell.result!.columns}
                        data={cell.result!.rows}
                        tableName={null}
                        pkColumns={null}
                        readonly
                    />
                </div>
            );
        case 'loading':
            return (
                <div className="flex items-center justify-center gap-2 p-6">
                    <div className="w-4 h-4 border-2 border-surface-secondary border-t-accent-primary rounded-full animate-spin" />
                    <span className="text-xs text-muted">{t('editor.executingQuery')}</span>
                </div>
            );
        case 'error':
            return <ErrorDisplay error={cell.error!} t={t} />;
        case 'empty':
            return (
                <p className="p-6 text-xs text-muted text-center">
                    {t('editor.notebook.reportNotRun')}
                </p>
            );
    }
}

interface ReportTileProps {
    cell: NotebookCell;
    label: string;
    onSpanChange: (span: number) => void;
}

function ReportTile({cell, label, onSpanChange}: ReportTileProps) {
    const {t} = useTranslation();
    const span = cell.reportSpan ?? REPORT_GRID_COLUMNS;
    // Live span while dragging; saved once on release so undo sees one step.
    const [preview, setPreview] = useState<number | null>(null);
    const drag = useRef<{startX: number; columnWidth: number} | null>(null);
    const sectionRef = useRef<HTMLElement>(null);
    const shown = preview ?? span;

    const commit = (next: number) => {
        if (next !== span) onSpanChange(next);
    };

    const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        const grid = sectionRef.current?.parentElement;
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
        <section
            ref={sectionRef}
            aria-label={label}
            className={`${reportSpanClass(shown)} relative bg-base border border-default rounded-lg overflow-hidden flex flex-col`}
        >
            {(cell.name || cell.cachedAt) && (
                <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-default">
                    <h3 className="text-sm font-medium text-primary truncate">{cell.name}</h3>
                    {cell.cachedAt && (
                        <span className="text-[10px] text-muted shrink-0">
                            {t('editor.notebook.cachedAt', {
                                time: new Date(cell.cachedAt).toLocaleString(),
                            })}
                        </span>
                    )}
                </header>
            )}
            <div className="flex-1">
                <TileBody cell={cell} />
            </div>
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
                className={`hidden md:block absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none hover:bg-accent-primary/30 focus-visible:bg-accent-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
                    preview !== null ? 'bg-accent-primary/40' : ''
                }`}
            />
            {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
        </section>
    );
}

export function NotebookReportView({
    cells,
    params,
    onParamsChange,
    onRunAll,
    onReportSpanChange,
    isRunning,
}: NotebookReportViewProps) {
    const {t} = useTranslation();
    const visible = reportCells(cells);

    return (
        <div className="space-y-3">
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <ParamsPanel params={params} onParamsChange={onParamsChange} />
                </div>
                <button
                    type="button"
                    onClick={onRunAll}
                    disabled={isRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent-primary text-on-accent hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                    <Play size={12} aria-hidden="true" />
                    {t('editor.notebook.runAll')}
                </button>
            </div>

            {visible.length === 0 ? (
                <p className="p-8 text-sm text-muted text-center">
                    {t('editor.notebook.reportEmpty')}
                </p>
            ) : (
                <div className="grid grid-cols-6 gap-3">
                    {visible.map((cell) => (
                        <ReportTile
                            key={cell.id}
                            cell={cell}
                            label={cell.name || `#${cells.indexOf(cell) + 1}`}
                            onSpanChange={(span) => onReportSpanChange(cell.id, span)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
