import {describe, it, expect, vi} from 'vitest';
import {cloneElement, type ReactElement} from 'react';
import {render, waitFor} from '@testing-library/react';
import {CellChart} from '@/components/notebook/CellChart';
import {CHART_TYPES} from '@/utils/notebookChart';
import type {QueryResult} from '@/types/editor';

// jsdom has no layout, so give the chart a real size instead of measuring.
vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('recharts')>();
    return {
        ...actual,
        ResponsiveContainer: ({children}: {children: ReactElement}) =>
            cloneElement(children as ReactElement<{width: number; height: number}>, {
                width: 600,
                height: 300,
            }),
    };
});
// Reduced motion skips the entry animation, so marks render at once.
vi.mock('@/hooks/usePrefersReducedMotion', () => ({usePrefersReducedMotion: () => true}));
vi.mock('react-i18next', () => ({useTranslation: () => ({t: (k: string) => k})}));
vi.mock('@/hooks/useChartPalette', () => ({
    useChartPalette: () => ({
        series: ['#101010', '#202020', '#303030', '#404040'],
        grid: '#555',
        tick: '#666',
        axis: '#777',
        surface: '#000',
    }),
    chartTooltipStyle: () => ({}),
}));

const result: QueryResult = {
    columns: ['region', 'revenue', 'delta'],
    rows: [
        ['North', 100, 12],
        ['South', 200, -30],
        ['East', 150, 5],
    ],
    affected_rows: 0,
};

describe('CellChart', () => {
    it.each(CHART_TYPES)('draws %s marks', async (type) => {
        const {container} = render(
            <CellChart
                result={result}
                config={{type, labelColumn: 'region', valueColumns: ['revenue', 'delta']}}
                onConfigChange={() => {}}
            />,
        );
        // Marks appear once the entry animation has run.
        await waitFor(
            () => {
                const svg = container.querySelector('.recharts-wrapper > svg');
                expect(svg!.querySelectorAll('path, rect, circle').length).toBeGreaterThan(2);
            },
            {timeout: 3000},
        );
    });

    it('colors positive and negative bars differently', async () => {
        const {container} = render(
            <CellChart
                result={result}
                config={{type: 'posNegBar', labelColumn: 'region', valueColumns: ['delta']}}
                onConfigChange={() => {}}
            />,
        );
        await waitFor(
            () =>
                expect(container.querySelectorAll('.recharts-bar-rectangle path')).toHaveLength(3),
            {timeout: 3000},
        );
        const fills = [...container.querySelectorAll('.recharts-bar-rectangle path')].map((p) =>
            p.getAttribute('fill'),
        );
        expect(fills).toEqual(['#202020', '#404040', '#202020']);
    });

    it('plots one series per distinct value of the series column', () => {
        const long: QueryResult = {
            columns: ['day', 'kind', 'n'],
            rows: [
                ['d1', 'a', 1],
                ['d1', 'b', 2],
                ['d2', 'a', 3],
                ['d2', 'b', 4],
            ],
            affected_rows: 0,
        };
        const {container} = render(
            <CellChart
                result={long}
                config={{
                    type: 'line',
                    labelColumn: 'day',
                    valueColumns: ['n'],
                    seriesColumn: 'kind',
                }}
                onConfigChange={() => {}}
            />,
        );
        expect(container.querySelectorAll('.recharts-line').length).toBe(2);
    });
});
