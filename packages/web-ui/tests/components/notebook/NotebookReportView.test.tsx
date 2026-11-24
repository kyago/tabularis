import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {NotebookReportView} from '@/components/notebook/NotebookReportView';
import type {QueryResult} from '@/types/editor';
import type {NotebookCell} from '@/types/notebook';

vi.mock('lucide-react', async (importOriginal) => await importOriginal());

vi.mock('@/hooks/useChartPalette', () => ({
    useChartPalette: () => ({
        grid: '#333',
        tick: '#999',
        series: ['#3b82f6'],
    }),
    chartTooltipStyle: () => ({}),
}));

vi.mock('@/components/ui/DataGrid', () => ({
    DataGrid: ({columns, data}: {columns: string[]; data: unknown[][]}) => (
        <div data-testid="report-grid" data-rows={data.length}>
            {columns.join(',')}
        </div>
    ),
}));

// The real recharts module, with the chart frame swapped for markers: the
// notebook draws every cartesian chart type through one ComposedChart.
vi.mock('recharts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('recharts')>()),
    ResponsiveContainer: ({children}: {children: React.ReactNode}) => (
        <div data-testid="responsive-chart">{children}</div>
    ),
    ComposedChart: ({children}: {children: React.ReactNode}) => (
        <div data-testid="bar-chart">{children}</div>
    ),
}));

const sampleResult: QueryResult = {
    columns: ['month', 'revenue'],
    rows: [
        ['Jan', 100],
        ['Feb', 200],
    ],
    affected_rows: 0,
};

const singleRowResult: QueryResult = {
    columns: ['total'],
    rows: [[300]],
    affected_rows: 0,
};

describe('NotebookReportView', () => {
    it('renders included markdown, results, charts and KPIs in document order and omits excluded cells', () => {
        const cells: NotebookCell[] = [
            {
                id: 'setup',
                type: 'sql',
                content: 'CREATE TEMP TABLE t AS SELECT 1',
                name: 'Setup query',
                includeInReport: false,
            },
            {
                id: 'intro',
                type: 'markdown',
                content: '# Monthly Revenue',
                isPreview: false, // Even if in edit mode in notebook, Report view renders Markdown
            },
            {
                id: 'kpi',
                type: 'sql',
                content: 'SELECT 300 AS total',
                name: 'Total Revenue',
                result: singleRowResult,
                executionTime: 12,
                kpiConfig: {column: 'total', label: 'Revenue', prefix: '$'},
            },
            {
                id: 'chart',
                type: 'sql',
                content: 'SELECT month, revenue FROM sales',
                name: 'Revenue by Month',
                result: sampleResult,
                executionTime: 25,
                chartConfig: {type: 'bar', labelColumn: 'month', valueColumns: ['revenue']},
            },
        ];

        render(
            <NotebookReportView
                cells={cells}
                params={[]}
                onParamsChange={vi.fn()}
                runAllResult={null}
                onDismissRunAllResult={vi.fn()}
                onSwitchToEdit={vi.fn()}
            />,
        );

        // Excluded setup cell is omitted
        expect(screen.queryByText('Setup query')).not.toBeInTheDocument();
        expect(screen.queryByText(/CREATE TEMP TABLE/)).not.toBeInTheDocument();

        // Markdown is rendered (not as a textarea)
        const heading = screen.getByRole('heading', {name: 'Monthly Revenue'});
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

        // KPI and Chart are rendered in read-only mode (no config inputs)
        expect(screen.getByText('$300')).toBeInTheDocument();
        expect(screen.queryByLabelText('editor.notebook.kpiColumn')).not.toBeInTheDocument();

        const chart = screen.getByTestId('bar-chart');
        expect(screen.queryByText('editor.notebook.chartType')).not.toBeInTheDocument();

        // Document order preserved: Markdown -> KPI -> Chart
        const kpiSection = screen.getByRole('region', {name: 'Total Revenue'});
        const chartSection = screen.getByRole('region', {name: 'Revenue by Month'});
        expect(
            heading.compareDocumentPosition(kpiSection) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            kpiSection.compareDocumentPosition(chartSection) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(chart).toBeInTheDocument();
    });

    it('keeps empty, running, failed and outdated states honest', () => {
        const cells: NotebookCell[] = [
            {id: 'empty', type: 'sql', content: 'SELECT 1', name: 'Empty Cell', result: null},
            {
                id: 'running',
                type: 'sql',
                content: 'SELECT 2',
                name: 'Running Cell',
                isLoading: true,
            },
            {
                id: 'failed',
                type: 'sql',
                content: 'SELECT bad',
                name: 'Failed Cell',
                error: 'relation "bad" does not exist',
            },
            {
                id: 'outdated-sql',
                type: 'sql',
                content: 'SELECT 999',
                name: 'Edited SQL Cell',
                result: singleRowResult,
                history: [
                    {query: 'SELECT 300', result: singleRowResult, executionTime: 5, timestamp: 1},
                ],
            },
            {
                id: 'outdated-param',
                type: 'sql',
                content: 'SELECT @month',
                name: 'Param Cell',
                result: singleRowResult,
            },
        ];

        render(
            <NotebookReportView
                cells={cells}
                params={[]}
                onParamsChange={vi.fn()}
                runAllResult={null}
                onDismissRunAllResult={vi.fn()}
                onSwitchToEdit={vi.fn()}
                outdatedCellIds={new Set(['outdated-param'])}
            />,
        );

        expect(screen.getByText('editor.notebook.reportNoOutput')).toBeInTheDocument();
        expect(screen.getByText('editor.executingQuery')).toBeInTheDocument();
        expect(screen.getByText(/relation "bad" does not exist/)).toBeInTheDocument();
        expect(screen.getAllByText('editor.notebook.reportOutdated')).toHaveLength(2);
    });

    it('renders empty report state with a switch-to-edit action when all cells are excluded', () => {
        const onSwitchToEdit = vi.fn();
        render(
            <NotebookReportView
                cells={[{id: 'c1', type: 'sql', content: 'SELECT 1', includeInReport: false}]}
                params={[]}
                onParamsChange={vi.fn()}
                runAllResult={null}
                onDismissRunAllResult={vi.fn()}
                onSwitchToEdit={onSwitchToEdit}
            />,
        );

        expect(screen.getByText('editor.notebook.reportEmpty')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'editor.notebook.editMode'}));
        expect(onSwitchToEdit).toHaveBeenCalledOnce();
    });

    it('retains parameter controls and updates params without executing', () => {
        const onParamsChange = vi.fn();
        render(
            <NotebookReportView
                cells={[{id: 'c1', type: 'sql', content: 'SELECT @month'}]}
                params={[{name: 'month', value: '2026-01'}]}
                onParamsChange={onParamsChange}
                runAllResult={null}
                onDismissRunAllResult={vi.fn()}
                onSwitchToEdit={vi.fn()}
            />,
        );

        const input = screen.getByDisplayValue('2026-01');
        fireEvent.change(input, {target: {value: '2026-02'}});
        expect(onParamsChange).toHaveBeenCalledWith([{name: 'month', value: '2026-02'}]);
    });
});

describe('NotebookReportView tile grid', () => {
    const tiles: NotebookCell[] = [
        {
            id: 'chart',
            type: 'sql',
            name: 'Revenue',
            content: 'SELECT month, revenue FROM sales',
            result: sampleResult,
            reportSpan: 3,
        },
        {id: 'table', type: 'sql', content: 'SELECT * FROM t', result: sampleResult},
    ];

    function renderGrid(cells: NotebookCell[] = tiles) {
        const onReportSpanChange = vi.fn();
        render(
            <NotebookReportView
                cells={cells}
                params={[]}
                onParamsChange={vi.fn()}
                runAllResult={null}
                onDismissRunAllResult={vi.fn()}
                onSwitchToEdit={vi.fn()}
                onReportSpanChange={onReportSpanChange}
            />,
        );
        return onReportSpanChange;
    }

    const tileOf = (title: string) => screen.getByText(title).closest('section')!.parentElement!;
    const handleOf = (title: string) =>
        screen.getByRole('separator', {name: `${title}: editor.notebook.reportWidth`});

    it('applies the saved tile width and defaults to full width', () => {
        renderGrid();
        expect(tileOf('Revenue').className).toContain('md:col-span-3');
        expect(handleOf('#2').getAttribute('aria-valuenow')).toBe('6');
    });

    it('widens and narrows a tile one column with the arrow keys, within the grid', () => {
        const onReportSpanChange = renderGrid();
        fireEvent.keyDown(handleOf('Revenue'), {key: 'ArrowRight'});
        expect(onReportSpanChange).toHaveBeenLastCalledWith('chart', 4);
        fireEvent.keyDown(handleOf('Revenue'), {key: 'ArrowLeft'});
        expect(onReportSpanChange).toHaveBeenLastCalledWith('chart', 2);
        fireEvent.keyDown(handleOf('#2'), {key: 'ArrowRight'});
        expect(onReportSpanChange).toHaveBeenCalledTimes(2);
    });

    it('snaps a drag to whole columns and saves once on release', () => {
        const onReportSpanChange = renderGrid();
        tileOf('Revenue').parentElement!.getBoundingClientRect = () => ({width: 600}) as DOMRect;
        const handle = handleOf('Revenue');
        fireEvent.pointerDown(handle, {clientX: 300, pointerId: 1});
        fireEvent.pointerMove(handle, {clientX: 420, pointerId: 1});
        expect(tileOf('Revenue').className).toContain('md:col-span-4');
        expect(onReportSpanChange).not.toHaveBeenCalled();
        fireEvent.pointerUp(handle, {clientX: 420, pointerId: 1});
        expect(onReportSpanChange).toHaveBeenCalledExactlyOnceWith('chart', 4);
    });

    it('shows when a result came from the cache', () => {
        renderGrid([{...tiles[0], cachedAt: Date.UTC(2026, 10, 13, 4, 42)}]);
        expect(screen.getByText('editor.notebook.cachedAt')).toBeInTheDocument();
    });
});
