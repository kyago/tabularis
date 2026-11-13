import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {NotebookReportView} from '../../../src/components/notebook/NotebookReportView';
import type {NotebookCell} from '../../../src/types/notebook';

vi.mock('react-i18next', () => ({useTranslation: () => ({t: (k: string) => k})}));
vi.mock('../../../src/components/ui/DataGrid', () => ({
    DataGrid: ({columns}: {columns: string[]}) => <div data-testid="grid">{columns.join(',')}</div>,
}));
vi.mock('../../../src/components/notebook/CellChart', () => ({
    CellChart: ({onConfigChange}: {onConfigChange?: unknown}) => (
        <div data-testid="chart">{onConfigChange ? 'editable' : 'readonly'}</div>
    ),
}));
vi.mock('../../../src/components/notebook/ParamsPanel', () => ({
    ParamsPanel: () => <div data-testid="params" />,
}));

const result = {columns: ['region', 'revenue'], rows: [['N', 1]], affected_rows: 0};

const cells: NotebookCell[] = [
    {id: 'm', type: 'markdown', content: '# Sales overview'},
    {
        id: 'chart',
        type: 'sql',
        name: 'Revenue',
        content: 'SELECT region, revenue FROM sales',
        result,
        chartConfig: {type: 'bar', labelColumn: 'region', valueColumns: ['revenue']},
        reportSpan: 3,
    },
    {id: 'table', type: 'sql', content: 'SELECT * FROM t', result},
    {
        id: 'setup',
        type: 'sql',
        name: 'Setup temp table',
        content: 'CREATE TEMP',
        isReportHidden: true,
    },
    {id: 'pending', type: 'sql', content: 'SELECT 2'},
];

function renderView(overrides: Partial<Parameters<typeof NotebookReportView>[0]> = {}) {
    const props = {
        cells,
        params: [],
        onParamsChange: vi.fn(),
        onRunAll: vi.fn(),
        onReportSpanChange: vi.fn(),
        isRunning: false,
        ...overrides,
    };
    render(<NotebookReportView {...props} />);
    return props;
}

describe('NotebookReportView', () => {
    it('renders markdown, a read-only chart and a table without SQL source', () => {
        renderView();
        expect(screen.getByText('Sales overview')).toBeTruthy();
        expect(screen.getByTestId('chart').textContent).toBe('readonly');
        expect(screen.getByTestId('grid')).toBeTruthy();
        expect(screen.queryByText('SELECT region, revenue FROM sales')).toBeNull();
    });

    it('omits cells excluded from the report', () => {
        renderView();
        expect(screen.queryByText('Setup temp table')).toBeNull();
    });

    it('marks cells that have not run yet', () => {
        renderView();
        expect(screen.getByText('editor.notebook.reportNotRun')).toBeTruthy();
    });

    it('applies the configured tile width', () => {
        renderView();
        expect(screen.getByText('Revenue').closest('section')!.className).toContain(
            'md:col-span-3',
        );
    });

    it('shows an empty state when every cell is excluded', () => {
        renderView({cells: [{...cells[3]}]});
        expect(screen.getByText('editor.notebook.reportEmpty')).toBeTruthy();
    });

    it('runs all cells through the given handler', () => {
        const props = renderView();
        fireEvent.click(screen.getByRole('button', {name: 'editor.notebook.runAll'}));
        expect(props.onRunAll).toHaveBeenCalledTimes(1);
    });

    it('shows when a result came from the cache', () => {
        renderView({cells: [{...cells[2], cachedAt: Date.UTC(2026, 10, 13, 4, 42)}]});
        expect(screen.getByText('editor.notebook.cachedAt')).toBeTruthy();
    });
    it('exposes a width handle per tile for assistive tech', () => {
        renderView();
        const handle = screen.getByRole('separator', {
            name: 'Revenue: editor.notebook.reportWidth',
        });
        expect(handle.getAttribute('aria-valuenow')).toBe('3');
        expect(handle.getAttribute('aria-valuemin')).toBe('1');
        expect(handle.getAttribute('aria-valuemax')).toBe('6');
    });

    it('widens and narrows a tile one column with the arrow keys', () => {
        const props = renderView();
        const handle = screen.getByRole('separator', {
            name: 'Revenue: editor.notebook.reportWidth',
        });
        fireEvent.keyDown(handle, {key: 'ArrowRight'});
        expect(props.onReportSpanChange).toHaveBeenLastCalledWith('chart', 4);
        fireEvent.keyDown(handle, {key: 'ArrowLeft'});
        expect(props.onReportSpanChange).toHaveBeenLastCalledWith('chart', 2);
    });

    it('does not go past the grid edges', () => {
        const props = renderView({cells: [{...cells[2], reportSpan: 6}]});
        fireEvent.keyDown(screen.getAllByRole('separator')[0], {key: 'ArrowRight'});
        expect(props.onReportSpanChange).not.toHaveBeenCalled();
    });

    it('snaps a drag to whole columns and saves once on release', () => {
        const props = renderView();
        const grid = screen.getByText('Revenue').closest('section')!.parentElement!;
        grid.getBoundingClientRect = () => ({width: 600}) as DOMRect;
        const handle = screen.getByRole('separator', {
            name: 'Revenue: editor.notebook.reportWidth',
        });
        fireEvent.pointerDown(handle, {clientX: 300, pointerId: 1});
        fireEvent.pointerMove(handle, {clientX: 420, pointerId: 1});
        expect(screen.getByText('Revenue').closest('section')!.className).toContain(
            'md:col-span-4',
        );
        expect(props.onReportSpanChange).not.toHaveBeenCalled();
        fireEvent.pointerUp(handle, {clientX: 420, pointerId: 1});
        expect(props.onReportSpanChange).toHaveBeenCalledExactlyOnceWith('chart', 4);
    });
});
