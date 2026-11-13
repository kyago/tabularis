import {REPORT_GRID_COLUMNS, type NotebookCell} from '@/types/notebook';
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

// Literal class names so Tailwind generates every span.
const SPANS = [
    '',
    'md:col-span-1',
    'md:col-span-2',
    'md:col-span-3',
    'md:col-span-4',
    'md:col-span-5',
    'md:col-span-6',
];

/** Grid span on the 6-column report grid; narrow screens always stack tiles full width. */
export function reportSpanClass(span?: number): string {
    return `col-span-6 ${SPANS[span ?? REPORT_GRID_COLUMNS] || SPANS[REPORT_GRID_COLUMNS]}`;
}

/** Span after dragging a tile edge by `dx` pixels, snapped to whole columns and clamped to 1-6. */
export function spanFromDrag(startSpan: number, dx: number, columnWidth: number): number {
    if (columnWidth <= 0) return startSpan;
    const span = startSpan + Math.round(dx / columnWidth);
    return Math.min(REPORT_GRID_COLUMNS, Math.max(1, span));
}
