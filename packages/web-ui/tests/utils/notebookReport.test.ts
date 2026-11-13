import {describe, it, expect} from 'vitest';
import {
    reportCells,
    reportTileContent,
    reportSpanClass,
    spanFromDrag,
} from '@/utils/notebookReport';
import type {NotebookCell} from '@/types/notebook';

const result = {columns: ['region', 'revenue'], rows: [['N', 1]], affected_rows: 0};

function sql(partial: Partial<NotebookCell> = {}): NotebookCell {
    return {id: 'c', type: 'sql', content: 'SELECT 1', ...partial};
}

describe('reportCells', () => {
    it('drops hidden cells and keeps notebook order', () => {
        const cells = [sql({id: 'a'}), sql({id: 'b', isReportHidden: true}), sql({id: 'c'})];
        expect(reportCells(cells).map((c) => c.id)).toEqual(['a', 'c']);
    });
});

describe('reportTileContent', () => {
    it.each<[string, NotebookCell, string]>([
        ['markdown', {id: 'm', type: 'markdown', content: '# T'}, 'markdown'],
        ['loading', sql({isLoading: true, result}), 'loading'],
        ['error', sql({error: 'boom'}), 'error'],
        ['not run', sql(), 'empty'],
        [
            'chart',
            sql({
                result,
                chartConfig: {type: 'bar', labelColumn: 'region', valueColumns: ['revenue']},
            }),
            'chart',
        ],
        [
            'chart hidden',
            sql({
                result,
                chartConfig: {type: 'bar', labelColumn: 'region', valueColumns: ['revenue']},
                isChartVisible: false,
            }),
            'table',
        ],
        ['table', sql({result}), 'table'],
    ])('%s', (_name, cell, expected) => {
        expect(reportTileContent(cell)).toBe(expected);
    });
});

describe('reportSpanClass', () => {
    it.each([
        [1, 'md:col-span-1'],
        [4, 'md:col-span-4'],
        [6, 'md:col-span-6'],
        [undefined, 'md:col-span-6'],
    ] as const)('span %s', (span, cls) => {
        expect(reportSpanClass(span)).toContain(cls);
        expect(reportSpanClass(span)).toContain('col-span-6');
    });
});

describe('spanFromDrag', () => {
    it.each([
        // start span, pointer delta px, column width px, expected span
        [3, 0, 100, 3],
        [3, 49, 100, 3],
        [3, 51, 100, 4],
        [3, 220, 100, 5],
        [3, -160, 100, 1],
        [3, 900, 100, 6],
        [3, -900, 100, 1],
    ])('from %i dragged %ipx (column %ipx) → %i', (start, dx, column, expected) => {
        expect(spanFromDrag(start, dx, column)).toBe(expected);
    });

    it('keeps the span when the column width is unknown', () => {
        expect(spanFromDrag(4, 300, 0)).toBe(4);
    });
});
