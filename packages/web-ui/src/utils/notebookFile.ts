import {
    REPORT_GRID_COLUMNS,
    type NotebookCell,
    type NotebookFile,
    type NotebookParam,
} from '@/types/notebook';
import {generateCellId} from './notebook';
import {validateParamName} from './notebookParams';
import {sanitizeKpiConfig} from './notebookKpi';

/**
 * Keep only well-formed params from an untrusted notebook file: name must be
 * a valid identifier (`\w+`) and value must be a string. Malformed entries
 * are dropped instead of failing the whole import.
 */
// Width presets written before tiles were resized by dragging.
const LEGACY_REPORT_WIDTHS: Record<string, number> = {full: 6, half: 3, third: 2};

function sanitizeReportSpan(span: unknown, legacyWidth: unknown): number | undefined {
    if (
        typeof span === 'number' &&
        Number.isInteger(span) &&
        span >= 1 &&
        span <= REPORT_GRID_COLUMNS
    )
        return span;
    if (span !== undefined) return undefined;
    return typeof legacyWidth === 'string' ? LEGACY_REPORT_WIDTHS[legacyWidth] : undefined;
}

function sanitizeParams(raw: unknown): NotebookParam[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const params = raw.filter((p): p is NotebookParam => {
        if (typeof p !== 'object' || p === null) return false;
        const {name, value} = p as Record<string, unknown>;
        return typeof name === 'string' && validateParamName(name) && typeof value === 'string';
    });
    return params.length > 0 ? params : undefined;
}

export function serializeNotebook(
    title: string,
    cells: NotebookCell[],
    params?: NotebookParam[],
    stopOnError?: boolean,
    connectionId?: string,
): NotebookFile {
    return {
        version: 2,
        title,
        createdAt: new Date().toISOString(),
        ...(connectionId ? {connectionId} : {}),
        cells: cells.map((c) => ({
            type: c.type,
            content: c.content,
            ...(c.name ? {name: c.name} : {}),
            ...(c.schema ? {schema: c.schema} : {}),
            ...(c.chartConfig ? {chartConfig: c.chartConfig} : {}),
            ...(c.isParallel ? {isParallel: c.isParallel} : {}),
            ...(c.isCollapsed ? {isCollapsed: c.isCollapsed} : {}),
            ...(c.isQueryCollapsed ? {isQueryCollapsed: c.isQueryCollapsed} : {}),
            ...(c.isResultCollapsed ? {isResultCollapsed: c.isResultCollapsed} : {}),
            ...(c.isChartVisible != null ? {isChartVisible: c.isChartVisible} : {}),
            ...(c.kpiConfig ? {kpiConfig: c.kpiConfig} : {}),
            ...(c.isKpiVisible != null ? {isKpiVisible: c.isKpiVisible} : {}),
            ...(c.isQueryPlanVisible != null ? {isQueryPlanVisible: c.isQueryPlanVisible} : {}),
            ...(c.isReportHidden ? {isReportHidden: true} : {}),
            ...(c.reportSpan ? {reportSpan: c.reportSpan} : {}),
        })),
        ...(params && params.length > 0 ? {params} : {}),
        ...(stopOnError ? {stopOnError} : {}),
    };
}

export function validateNotebookFile(data: unknown): data is NotebookFile {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    if (typeof obj.version !== 'number') return false;
    if (typeof obj.title !== 'string') return false;
    if (!Array.isArray(obj.cells)) return false;
    return obj.cells.every(
        (cell: unknown) =>
            typeof cell === 'object' &&
            cell !== null &&
            typeof (cell as Record<string, unknown>).type === 'string' &&
            ((cell as Record<string, unknown>).type === 'sql' ||
                (cell as Record<string, unknown>).type === 'markdown') &&
            typeof (cell as Record<string, unknown>).content === 'string',
    );
}

export function deserializeNotebook(json: string): {
    title: string;
    cells: NotebookCell[];
    params?: NotebookParam[];
    stopOnError?: boolean;
} {
    let data: unknown;
    try {
        data = JSON.parse(json);
    } catch {
        throw new Error('Invalid JSON');
    }

    if (!validateNotebookFile(data)) {
        throw new Error('Invalid notebook file format');
    }

    const raw = data as unknown as Record<string, unknown>;
    return {
        title: data.title,
        cells: data.cells.map((c) => {
            const cellRaw = c as Record<string, unknown>;
            return {
                id: generateCellId(),
                type: c.type,
                content: c.content,
                name: cellRaw.name as string | undefined,
                schema: c.schema,
                chartConfig: (cellRaw.chartConfig as NotebookCell['chartConfig']) ?? null,
                isParallel: cellRaw.isParallel as boolean | undefined,
                isCollapsed: cellRaw.isCollapsed as boolean | undefined,
                isQueryCollapsed: cellRaw.isQueryCollapsed as boolean | undefined,
                isResultCollapsed: cellRaw.isResultCollapsed as boolean | undefined,
                isChartVisible: cellRaw.isChartVisible as boolean | undefined,
                kpiConfig: sanitizeKpiConfig(cellRaw.kpiConfig),
                isKpiVisible:
                    typeof cellRaw.isKpiVisible === 'boolean' ? cellRaw.isKpiVisible : undefined,
                isQueryPlanVisible: cellRaw.isQueryPlanVisible as boolean | undefined,
                isReportHidden: cellRaw.isReportHidden === true ? true : undefined,
                reportSpan: sanitizeReportSpan(cellRaw.reportSpan, cellRaw.reportWidth),
                result: null,
                error: undefined,
                executionTime: null,
                isLoading: false,
                isPreview: c.type === 'markdown' ? true : undefined,
            };
        }),
        params: sanitizeParams(raw.params),
        stopOnError: typeof raw.stopOnError === 'boolean' ? raw.stopOnError : undefined,
    };
}
