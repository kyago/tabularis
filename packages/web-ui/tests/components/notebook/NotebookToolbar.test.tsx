import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {NotebookToolbar} from '@/components/notebook/NotebookToolbar';

vi.mock('lucide-react', async (importOriginal) => await importOriginal());

function renderToolbar(overrides: Record<string, unknown> = {}) {
    const props = {
        onAddSqlCell: vi.fn(),
        onAddMarkdownCell: vi.fn(),
        onRunAll: vi.fn(),
        onExport: vi.fn(),
        onExportHtml: vi.fn(),
        onExportSql: vi.fn(),
        onImport: vi.fn(),
        isRunning: false,
        stopOnError: false,
        onToggleStopOnError: vi.fn(),
        onCollapseAll: vi.fn(),
        onExpandAll: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        canUndo: false,
        canRedo: false,
        onToggleHistory: vi.fn(),
        historyOpen: false,
        viewMode: 'edit' as const,
        onToggleViewMode: vi.fn(),
        ...overrides,
    };
    render(<NotebookToolbar {...props} />);
    return props;
}

describe('NotebookToolbar', () => {
    it('offers SQL source export in the export menu after the HTML export', () => {
        const props = renderToolbar();

        fireEvent.click(screen.getByTitle('editor.notebook.export'));
        const html = screen.getByRole('button', {name: 'editor.notebook.exportHtml'});
        const sql = screen.getByRole('button', {name: 'editor.notebook.exportSql'});
        expect(html.compareDocumentPosition(sql) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        fireEvent.click(sql);
        expect(props.onExportSql).toHaveBeenCalledOnce();
        expect(props.onExport).not.toHaveBeenCalled();
        expect(props.onExportHtml).not.toHaveBeenCalled();
    });
    it('toggles between edit and report view', () => {
        const props = renderToolbar();
        const toggle = screen.getByRole('button', {name: 'editor.notebook.viewReport'});
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(toggle);
        expect(props.onToggleViewMode).toHaveBeenCalledOnce();
    });

    it('marks the report toggle pressed in report view', () => {
        renderToolbar({viewMode: 'report'});
        expect(
            screen
                .getByRole('button', {name: 'editor.notebook.viewReport'})
                .getAttribute('aria-pressed'),
        ).toBe('true');
    });
});
