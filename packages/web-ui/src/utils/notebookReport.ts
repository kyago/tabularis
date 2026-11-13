import type {NotebookCell, ReportWidth} from '@/types/notebook';
import {canRenderChart} from './notebookChart';

export type ReportTileContent = 'markdown' | 'chart' | 'table' | 'loading' | 'error' | 'empty';

/** Cells shown in report view, in notebook order. */
export function reportCells(cells: NotebookCell[]): NotebookCell[] {
    return cells.filter((c) => c.isReportHidden !== true);
}

/** What a report tile renders for a cell; mirrors the edit view's chart visibility default. */
export function reportTileContent(cell: NotebookCell): ReportTileContent {
    if (cell.type === 'markdown') return 'markdown';
    if (cell.isLoading) return 'loading';
    if (cell.error) return 'error';
    if (!cell.result) return 'empty';
    const chartVisible = cell.isChartVisible ?? !!cell.chartConfig;
    if (cell.chartConfig && chartVisible && canRenderChart(cell.result)) return 'chart';
    return 'table';
}

const SPANS: Record<ReportWidth, string> = {
    full: 'md:col-span-6',
    half: 'md:col-span-3',
    third: 'md:col-span-2',
};

/** Grid span on the 6-column report grid; narrow screens always stack tiles full width. */
export function reportSpanClass(width?: ReportWidth): string {
    return `col-span-6 ${SPANS[width ?? 'full']}`;
}
