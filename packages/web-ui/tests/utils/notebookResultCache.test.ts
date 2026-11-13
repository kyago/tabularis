import {describe, it, expect} from 'vitest';
import {MAX_CACHED_ROWS, applyCachedResults, serializeResults} from '@/utils/notebookResultCache';
import type {NotebookCell} from '@/types/notebook';

const result = {columns: ['n'], rows: [[1]], affected_rows: 0};

function sql(id: string, content: string, partial: Partial<NotebookCell> = {}): NotebookCell {
    return {id, type: 'sql', content, ...partial};
}

describe('serializeResults', () => {
    it('stores SQL results with their query and run time', () => {
        const raw = serializeResults(
            [sql('a', 'SELECT 1', {result, executionTime: 12}), sql('b', 'SELECT 2')],
            1000,
        );
        expect(JSON.parse(raw)).toEqual({
            version: 1,
            entries: [{content: 'SELECT 1', result, executionTime: 12, timestamp: 1000}],
        });
    });

    it('keeps the original timestamp of a restored result', () => {
        const raw = serializeResults([sql('a', 'SELECT 1', {result, cachedAt: 500})], 1000);
        expect(JSON.parse(raw).entries[0].timestamp).toBe(500);
    });

    it('skips results over the row limit', () => {
        const big = {
            columns: ['n'],
            rows: Array.from({length: MAX_CACHED_ROWS + 1}, (_, i) => [i]),
            affected_rows: 0,
        };
        const raw = serializeResults(
            [sql('a', 'SELECT big', {result: big}), sql('b', 'SELECT 1', {result})],
            1,
        );
        expect(JSON.parse(raw).entries.map((e: {content: string}) => e.content)).toEqual([
            'SELECT 1',
        ]);
    });
});

describe('applyCachedResults', () => {
    const raw = JSON.stringify({
        version: 1,
        entries: [
            {content: 'SELECT 1', result, executionTime: 12, timestamp: 500},
            {
                content: 'SELECT 1',
                result: {...result, rows: [[2]]},
                executionTime: 3,
                timestamp: 600,
            },
        ],
    });

    it('restores results by query with their cache time', () => {
        const [cell] = applyCachedResults([sql('fresh-id', 'SELECT 1')], raw);
        expect(cell.result).toEqual(result);
        expect(cell.executionTime).toBe(12);
        expect(cell.cachedAt).toBe(500);
    });

    it('restores duplicate queries in order', () => {
        const cells = applyCachedResults([sql('x', 'SELECT 1'), sql('y', 'SELECT 1')], raw);
        expect(cells[1].result!.rows).toEqual([[2]]);
    });

    it('does not overwrite a result that already exists', () => {
        const live = {...result, rows: [[9]]};
        const [cell] = applyCachedResults([sql('a', 'SELECT 1', {result: live})], raw);
        expect(cell.result).toBe(live);
        expect(cell.cachedAt).toBeUndefined();
    });

    it('leaves cells untouched for a corrupt or foreign file', () => {
        const cells = [sql('a', 'SELECT 1')];
        expect(applyCachedResults(cells, '{')).toBe(cells);
        expect(applyCachedResults(cells, JSON.stringify({version: 99, entries: []}))).toBe(cells);
        expect(applyCachedResults(cells, null)).toBe(cells);
    });

    it('ignores results whose query changed', () => {
        const [cell] = applyCachedResults([sql('a', 'SELECT 1 + 1')], raw);
        expect(cell.result).toBeUndefined();
    });
});
