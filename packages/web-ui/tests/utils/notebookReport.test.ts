import {describe, it, expect} from 'vitest';
import {reportSpanClass, spanFromDrag} from '@/utils/notebookReport';

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
