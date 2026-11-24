import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {
    Area,
    Bar,
    CartesianGrid,
    Cell,
    ComposedChart,
    Funnel,
    FunnelChart,
    LabelList,
    Legend,
    Line,
    Pie,
    PieChart,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ReferenceLine,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    Treemap,
    XAxis,
    YAxis,
} from 'recharts';
import {
    chartTooltipStyle as tooltipStyle,
    useChartPalette,
    type ChartPalette,
} from '@/hooks/useChartPalette';
import {usePrefersReducedMotion} from '@/hooks/usePrefersReducedMotion';
import type {QueryResult} from '@/types/editor';
import type {CellChartConfig, ChartType} from '@/types/notebook';
import {
    CHART_TYPES,
    SINGLE_SERIES_TYPES,
    buildChartData,
    canRenderChart,
    getNumericColumns,
    getLabelColumns,
    type ChartDataPoint,
} from '@/utils/notebookChart';
import {CompactSelect} from '@/components/notebook/CompactSelect';

const CHART_TYPE_LABELS: Record<ChartType, string> = {
    bar: 'Bar',
    stackedBar: 'Stacked bar',
    percentBar: '100% stacked bar',
    horizontalBar: 'Horizontal bar',
    posNegBar: 'Positive / negative bar',
    line: 'Line',
    area: 'Area',
    stackedArea: 'Stacked area',
    combo: 'Bar + line',
    scatter: 'Scatter (X = 1st value)',
    pie: 'Pie',
    donut: 'Donut',
    treemap: 'Treemap',
    radar: 'Radar',
    funnel: 'Funnel',
};

interface ChartTypeSelectorProps {
    config: CellChartConfig;
    result: QueryResult;
    onConfigChange: (config: CellChartConfig) => void;
}

function ChartTypeSelector({config, result, onConfigChange}: ChartTypeSelectorProps) {
    const {t} = useTranslation();
    const numericCols = getNumericColumns(result);
    const labelCols = getLabelColumns(result);

    return (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-elevated border-b border-default flex-wrap">
            <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted uppercase font-semibold">
                    {t('editor.notebook.chartType')}
                </span>
                <CompactSelect
                    value={config.type}
                    onChange={(e) => onConfigChange({...config, type: e.target.value as ChartType})}
                >
                    {CHART_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {CHART_TYPE_LABELS[type]}
                        </option>
                    ))}
                </CompactSelect>
            </div>

            <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted uppercase font-semibold">
                    {t('editor.notebook.chartLabel')}
                </span>
                <CompactSelect
                    value={config.labelColumn}
                    onChange={(e) => onConfigChange({...config, labelColumn: e.target.value})}
                >
                    {labelCols.map((col) => (
                        <option key={col} value={col}>
                            {col}
                        </option>
                    ))}
                </CompactSelect>
            </div>

            <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted uppercase font-semibold">
                    {t('editor.notebook.chartSeries')}
                </span>
                <CompactSelect
                    value={config.seriesColumn ?? ''}
                    onChange={(e) =>
                        onConfigChange({...config, seriesColumn: e.target.value || undefined})
                    }
                >
                    <option value="">—</option>
                    {result.columns
                        .filter((col) => col !== config.labelColumn)
                        .map((col) => (
                            <option key={col} value={col}>
                                {col}
                            </option>
                        ))}
                </CompactSelect>
            </div>

            <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted uppercase font-semibold">
                    {t('editor.notebook.chartValues')}
                </span>
                <div className="flex gap-1">
                    {numericCols.map((col) => {
                        const isSelected = config.valueColumns.includes(col);
                        return (
                            <button
                                key={col}
                                type="button"
                                onClick={() => {
                                    const next = isSelected
                                        ? config.valueColumns.filter((c) => c !== col)
                                        : [...config.valueColumns, col];
                                    if (next.length > 0) {
                                        onConfigChange({...config, valueColumns: next});
                                    }
                                }}
                                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                                    isSelected
                                        ? 'bg-accent-success/20 text-accent-success font-semibold'
                                        : 'text-muted hover:text-secondary hover:bg-surface-secondary'
                                }`}
                            >
                                {col}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

interface CellChartProps {
    result: QueryResult;
    config: CellChartConfig;
    /** Omit for a read-only chart (report view): the type/column controls are hidden. */
    onConfigChange?: (config: CellChartConfig) => void;
    height?: number;
    readOnly?: boolean;
}

interface ChartViewProps {
    type: ChartType;
    data: ChartDataPoint[];
    keys: string[];
    palette: ChartPalette;
    animate: boolean;
}

const color = (palette: ChartPalette, i: number) => palette.series[i % palette.series.length];
const percentTick = (v: number) => `${Math.round(v * 100)}%`;

/** Bar, line and area variants share one ComposedChart so they can be mixed (combo). */
function CartesianView({type, data, keys, palette, animate}: ChartViewProps) {
    const horizontal = type === 'horizontalBar';
    const stackId =
        type === 'stackedBar' || type === 'percentBar' || type === 'stackedArea'
            ? 'stack'
            : undefined;
    const tick = {fontSize: 10, fill: palette.tick};
    const categoryAxis = horizontal ? (
        <YAxis type="category" dataKey="label" tick={tick} width={90} />
    ) : (
        <XAxis dataKey="label" tick={tick} />
    );
    const valueAxisProps = {
        tick,
        ...(type === 'percentBar' ? {tickFormatter: percentTick} : {}),
    };
    const valueAxis = horizontal ? (
        <XAxis type="number" {...valueAxisProps} />
    ) : (
        <YAxis {...valueAxisProps} />
    );
    const radius: [number, number, number, number] = horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0];

    const mark = (key: string, i: number): ReactNode => {
        const fill = color(palette, i);
        if (type === 'line' || (type === 'combo' && i > 0)) {
            return (
                <Line
                    isAnimationActive={animate}
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={fill}
                    strokeWidth={2}
                    dot={{r: 3}}
                />
            );
        }
        if (type === 'area' || type === 'stackedArea') {
            return (
                <Area
                    isAnimationActive={animate}
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId={stackId}
                    stroke={fill}
                    fill={fill}
                    fillOpacity={type === 'area' ? 0.15 : 0.5}
                />
            );
        }
        return (
            <Bar
                isAnimationActive={animate}
                key={key}
                dataKey={key}
                stackId={stackId}
                fill={fill}
                // Stacked segments only round the outer end of the stack.
                radius={stackId && i < keys.length - 1 ? 0 : radius}
            >
                {type === 'posNegBar' &&
                    data.map((point, j) => (
                        <Cell
                            key={j}
                            fill={
                                (point[key] as number) < 0 ? palette.series[3] : palette.series[1]
                            }
                        />
                    ))}
            </Bar>
        );
    };

    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
                data={data}
                layout={horizontal ? 'vertical' : 'horizontal'}
                stackOffset={type === 'percentBar' ? 'expand' : 'sign'}
                margin={{top: 10, right: 20, left: 0, bottom: 0}}
            >
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                {categoryAxis}
                {valueAxis}
                <Tooltip contentStyle={tooltipStyle(palette)} />
                {keys.length > 1 && <Legend wrapperStyle={{fontSize: 11}} />}
                {horizontal ? (
                    <ReferenceLine x={0} stroke={palette.axis} />
                ) : (
                    <ReferenceLine y={0} stroke={palette.axis} />
                )}
                {keys.map(mark)}
            </ComposedChart>
        </ResponsiveContainer>
    );
}

/** X is the first value column, every other value column is a Y series. */
function ScatterView({data, keys, palette, animate}: ChartViewProps) {
    const [xKey, ...yKeys] = keys;
    const tick = {fontSize: 10, fill: palette.tick};
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{top: 10, right: 20, left: 0, bottom: 0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis type="number" dataKey="x" name={xKey} tick={tick} />
                <YAxis type="number" dataKey="y" tick={tick} />
                <Tooltip contentStyle={tooltipStyle(palette)} />
                {yKeys.length > 1 && <Legend wrapperStyle={{fontSize: 11}} />}
                {yKeys.map((key, i) => (
                    <Scatter
                        isAnimationActive={animate}
                        key={key}
                        name={key}
                        fill={color(palette, i)}
                        data={data.map((p) => ({label: p.label, x: p[xKey], y: p[key]}))}
                    />
                ))}
            </ScatterChart>
        </ResponsiveContainer>
    );
}

function PieView({type, data, keys, palette, animate}: ChartViewProps) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Tooltip contentStyle={tooltipStyle(palette)} />
                <Legend wrapperStyle={{fontSize: 11}} />
                <Pie
                    isAnimationActive={animate}
                    data={data}
                    dataKey={keys[0]}
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={type === 'donut' ? '45%' : 0}
                    outerRadius="70%"
                    label={({name, percent}: {name?: string; percent?: number}) =>
                        `${name ?? ''}: ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                    style={{fontSize: 10}}
                >
                    {data.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={color(palette, i)} />
                    ))}
                </Pie>
            </PieChart>
        </ResponsiveContainer>
    );
}

function TreemapView({data, keys, palette}: ChartViewProps) {
    const nodes = data
        .map((p) => ({name: p.label, size: p[keys[0]] as number}))
        // Treemap areas cannot be negative or zero.
        .filter((n) => n.size > 0);
    return (
        <ResponsiveContainer width="100%" height="100%">
            <Treemap
                data={nodes}
                dataKey="size"
                nameKey="name"
                stroke={palette.surface}
                isAnimationActive={false}
                content={(props: {
                    x?: number;
                    y?: number;
                    width?: number;
                    height?: number;
                    index?: number;
                    name?: string;
                }) => {
                    const {x = 0, y = 0, width = 0, height = 0, index = 0, name} = props;
                    return (
                        <g>
                            <rect
                                x={x}
                                y={y}
                                width={width}
                                height={height}
                                fill={color(palette, index)}
                                stroke={palette.surface}
                            />
                            {width > 40 && height > 16 && (
                                <text x={x + 4} y={y + 13} fontSize={10} fill={palette.surface}>
                                    {name}
                                </text>
                            )}
                        </g>
                    );
                }}
            >
                <Tooltip contentStyle={tooltipStyle(palette)} />
            </Treemap>
        </ResponsiveContainer>
    );
}

function RadarView({data, keys, palette, animate}: ChartViewProps) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="70%">
                <PolarGrid stroke={palette.grid} />
                <PolarAngleAxis dataKey="label" tick={{fontSize: 10, fill: palette.tick}} />
                <PolarRadiusAxis tick={{fontSize: 9, fill: palette.tick}} />
                <Tooltip contentStyle={tooltipStyle(palette)} />
                {keys.length > 1 && <Legend wrapperStyle={{fontSize: 11}} />}
                {keys.map((key, i) => (
                    <Radar
                        isAnimationActive={animate}
                        key={key}
                        dataKey={key}
                        stroke={color(palette, i)}
                        fill={color(palette, i)}
                        fillOpacity={0.2}
                    />
                ))}
            </RadarChart>
        </ResponsiveContainer>
    );
}

function FunnelView({data, keys, palette}: ChartViewProps) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
                <Tooltip contentStyle={tooltipStyle(palette)} />
                <Funnel data={data} dataKey={keys[0]} nameKey="label" isAnimationActive={false}>
                    {data.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={color(palette, i)} />
                    ))}
                    <LabelList
                        position="right"
                        dataKey="label"
                        fill={palette.tick}
                        stroke="none"
                        fontSize={10}
                    />
                </Funnel>
            </FunnelChart>
        </ResponsiveContainer>
    );
}

function ChartView(props: ChartViewProps) {
    switch (props.type) {
        case 'scatter':
            return <ScatterView {...props} />;
        case 'pie':
        case 'donut':
            return <PieView {...props} />;
        case 'treemap':
            return <TreemapView {...props} />;
        case 'radar':
            return <RadarView {...props} />;
        case 'funnel':
            return <FunnelView {...props} />;
        default:
            return <CartesianView {...props} />;
    }
}

export function CellChart({
    result,
    config,
    onConfigChange,
    height = 250,
    readOnly = false,
}: CellChartProps) {
    const {t} = useTranslation();
    const palette = useChartPalette();
    const animate = !usePrefersReducedMotion();
    if (!canRenderChart(result)) return null;

    const {data, keys} = buildChartData(result, config);
    if (data.length === 0 || keys.length === 0) return null;
    const plotted = SINGLE_SERIES_TYPES.has(config.type) ? keys.slice(0, 1) : keys;
    const needsTwo = config.type === 'scatter' && plotted.length < 2;

    return (
        <div className="border-t border-default">
            {!readOnly && onConfigChange && (
                <ChartTypeSelector
                    config={config}
                    result={result}
                    onConfigChange={onConfigChange}
                />
            )}
            <div style={{height}} className="p-2">
                {needsTwo ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted">
                        {t('editor.notebook.chartScatterHint')}
                    </div>
                ) : (
                    <ChartView
                        type={config.type}
                        data={data}
                        keys={plotted}
                        palette={palette}
                        animate={animate}
                    />
                )}
            </div>
        </div>
    );
}
