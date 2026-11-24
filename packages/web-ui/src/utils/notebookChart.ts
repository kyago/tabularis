import type {QueryResult} from '@/types/editor';
import type {CellChartConfig, ChartType} from '@/types/notebook';

export interface ChartDataPoint {
    label: string;
    [key: string]: string | number;
}

export function canRenderChart(result: QueryResult): boolean {
    return result.columns.length >= 2 && result.rows.length > 0;
}

/**
 * A string holding a finite number, such as `'1500.00'`. PostgreSQL `NUMERIC`
 * and MySQL `DECIMAL` values (sums and averages included) arrive as strings to
 * keep their precision.
 */
function isNumericString(value: unknown): value is string {
    return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

/** Every non-NULL value in the column is a numeric string, and there is one. */
function hasOnlyNumericStrings(result: QueryResult, colIndex: number): boolean {
    let found = false;
    for (const row of result.rows) {
        const value = row[colIndex];
        if (value === null || value === undefined) continue;
        if (!isNumericString(value)) return false;
        found = true;
    }
    return found;
}

export function getNumericColumns(result: QueryResult): string[] {
    if (result.rows.length === 0) return [];
    return result.columns.filter(
        (_, colIndex) =>
            result.rows.some((row) => typeof row[colIndex] === 'number') ||
            hasOnlyNumericStrings(result, colIndex),
    );
}

export function getLabelColumns(result: QueryResult): string[] {
    if (result.rows.length === 0) return [];
    return result.columns.filter((_, colIndex) =>
        result.rows.some((row) => typeof row[colIndex] === 'string'),
    );
}

export function buildDefaultChartConfig(result: QueryResult): CellChartConfig | null {
    const labelCols = getLabelColumns(result);
    const numericCols = getNumericColumns(result);

    // A column of numeric strings (a DECIMAL total) is a better value than label.
    const labelColumn =
        labelCols.find((col) => !hasOnlyNumericStrings(result, result.columns.indexOf(col))) ??
        labelCols[0];
    const valueColumn = numericCols.find((col) => col !== labelColumn);
    if (labelColumn === undefined || valueColumn === undefined) return null;

    return {
        type: 'bar' as ChartType,
        labelColumn,
        valueColumns: [valueColumn],
    };
}

export function transformResultToChartData(
    result: QueryResult,
    config: CellChartConfig,
): ChartDataPoint[] {
    const labelIdx = result.columns.indexOf(config.labelColumn);
    if (labelIdx === -1) return [];

    const valueIndices = config.valueColumns
        .map((col) => ({name: col, idx: result.columns.indexOf(col)}))
        .filter((v) => v.idx !== -1);

    if (valueIndices.length === 0) return [];

    return result.rows.map((row) => {
        const point: ChartDataPoint = {
            label: row[labelIdx] != null ? String(row[labelIdx]) : '',
        };
        for (const {name, idx} of valueIndices) {
            const val = row[idx];
            point[name] = typeof val === 'number' ? val : Number(val) || 0;
        }
        return point;
    });
}

/** Chart types offered in the notebook, in menu order. */
export const CHART_TYPES: ChartType[] = [
    'bar',
    'stackedBar',
    'percentBar',
    'horizontalBar',
    'posNegBar',
    'line',
    'area',
    'stackedArea',
    'combo',
    'scatter',
    'pie',
    'donut',
    'treemap',
    'radar',
    'funnel',
];

/** Types that plot one value per label; extra series are ignored. */
export const SINGLE_SERIES_TYPES: ReadonlySet<ChartType> = new Set([
    'pie',
    'donut',
    'treemap',
    'funnel',
]);

/**
 * Chart points plus the series keys to plot. With `seriesColumn`, long rows
 * (label, series, value) are pivoted into one point per label and one key per series.
 */
export function buildChartData(
    result: QueryResult,
    config: CellChartConfig,
): {data: ChartDataPoint[]; keys: string[]} {
    const seriesIdx = config.seriesColumn ? result.columns.indexOf(config.seriesColumn) : -1;
    if (seriesIdx === -1) {
        const data = transformResultToChartData(result, config);
        return {data, keys: config.valueColumns.filter((c) => result.columns.includes(c))};
    }
    const labelIdx = result.columns.indexOf(config.labelColumn);
    const valueIdx = result.columns.indexOf(config.valueColumns[0]);
    if (labelIdx === -1 || valueIdx === -1) return {data: [], keys: []};

    const byLabel = new Map<string, ChartDataPoint>();
    const keys: string[] = [];
    for (const row of result.rows) {
        const label = row[labelIdx] != null ? String(row[labelIdx]) : '';
        const key = row[seriesIdx] != null ? String(row[seriesIdx]) : '(null)';
        if (!keys.includes(key)) keys.push(key);
        let point = byLabel.get(label);
        if (!point) byLabel.set(label, (point = {label}));
        const val = row[valueIdx];
        // Duplicate (label, series) rows are summed rather than silently overwritten.
        const num = typeof val === 'number' ? val : Number(val) || 0;
        point[key] = (typeof point[key] === 'number' ? (point[key] as number) : 0) + num;
    }
    return {data: [...byLabel.values()], keys};
}
