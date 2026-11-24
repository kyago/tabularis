import {REPORT_GRID_COLUMNS} from '@/types/notebook';

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
