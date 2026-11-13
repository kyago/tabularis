import {useTranslation} from 'react-i18next';
import {Play} from 'lucide-react';
import {DataGrid} from '@/components/ui/DataGrid';
import {ErrorDisplay} from '@/components/ui/ErrorDisplay';
import type {NotebookCell, NotebookParam} from '@/types/notebook';
import {reportCells, reportSpanClass, reportTileContent} from '@/utils/notebookReport';
import {CellChart} from './CellChart';
import {MarkdownPreview} from './MarkdownCell';
import {ParamsPanel} from './ParamsPanel';

interface NotebookReportViewProps {
    cells: NotebookCell[];
    params: NotebookParam[];
    onParamsChange: (params: NotebookParam[]) => void;
    onRunAll: () => void;
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
            return <p className="p-6 text-xs text-muted text-center">{t('editor.notebook.reportNotRun')}</p>;
    }
}

export function NotebookReportView({
    cells,
    params,
    onParamsChange,
    onRunAll,
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent-primary text-on-accent hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
                >
                    <Play size={12} aria-hidden="true" />
                    {t('editor.notebook.runAll')}
                </button>
            </div>

            {visible.length === 0 ? (
                <p className="p-8 text-sm text-muted text-center">{t('editor.notebook.reportEmpty')}</p>
            ) : (
                <div className="grid grid-cols-6 gap-3">
                    {visible.map((cell) => (
                        <section
                            key={cell.id}
                            className={`${reportSpanClass(cell.reportWidth)} bg-base border border-default rounded-lg overflow-hidden flex flex-col`}
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
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
