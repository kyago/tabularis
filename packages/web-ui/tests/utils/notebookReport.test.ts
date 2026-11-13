import {describe, it, expect} from 'vitest';
import {reportCells, reportTileContent, reportSpanClass} from '@/utils/notebookReport';
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
        ['full', 'md:col-span-6'],
        ['half', 'md:col-span-3'],
        ['third', 'md:col-span-2'],
        [undefined, 'md:col-span-6'],
    ] as const)('%s', (width, cls) => {
        expect(reportSpanClass(width)).toContain(cls);
        expect(reportSpanClass(width)).toContain('col-span-6');
    });
});
