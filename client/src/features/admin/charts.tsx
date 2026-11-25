/**
 * Chart kit for the operations dashboards (Recharts).
 * Palette validated with the dataviz validator (light surface #ffffff):
 *  - trend series  teal #0d9488 · blue #2563eb · rose #e11d48  (all checks PASS)
 *  - status donut  blue · amber #d97706 · violet #7c3aed · teal · rose (adjacent PASS; legend rows carry counts)
 * Marks: thin bars with 4px rounded data-ends, 2px surface gaps between stacked
 * segments, solid recessive horizontal grid only, legend for ≥ 2 series, hover tooltips,
 * and a table view on every chart.
 */
import { useState, type ReactNode } from 'react';
import { BarChart3, Table2, type LucideIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipPayloadEntry,
} from 'recharts';
import { Panel } from '@/components/app';
import { cn } from '@/lib/utils';

export const SERIES = {
  teal: '#0d9488',
  blue: '#2563eb',
  rose: '#e11d48',
  amber: '#d97706',
  violet: '#7c3aed',
} as const;

const AXIS_TICK = { fontSize: 12, fill: '#64748b' };
const GRID = '#edf1f5';
const SURFACE = '#ffffff';
const CURSOR = { fill: 'rgba(148, 163, 184, 0.14)' };

const fmt = (n: number) => n.toLocaleString('en-IN');

// ---------------------------------------------------------------------------
// Tooltip & legend
// ---------------------------------------------------------------------------
export interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
  label?: unknown;
  formatLabel?: (label: string) => string;
  unit?: string;
  showTotal?: boolean;
}

export function ChartTooltip({ active, payload, label, formatLabel, unit, showTotal = false }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => p.value !== undefined && p.value !== null);
  const total = rows.reduce((sum, p) => sum + Number(p.value ?? 0), 0);
  const title = formatLabel ? formatLabel(String(label ?? '')) : String(label ?? '');
  return (
    <div className="min-w-[160px] rounded-lg border bg-white px-3 py-2.5 text-xs shadow-lg">
      {title && <p className="mb-1.5 font-semibold text-slate-900">{title}</p>}
      <ul className="space-y-1">
        {rows.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: p.color ?? p.fill }} />
              {p.name}
            </span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {fmt(Number(p.value))}
              {unit ? ` ${unit}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {showTotal && rows.length > 1 && (
        <p className="mt-1.5 flex justify-between border-t pt-1.5 text-slate-600">
          Total <span className="font-semibold text-slate-900 tabular-nums">{fmt(total)}</span>
        </p>
      )}
    </div>
  );
}

export function ChartLegend({ items, className }: { items: { label: string; color: string; value?: ReactNode }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.color }} aria-hidden />
          {item.label}
          {item.value !== undefined && <span className="font-semibold text-slate-900 tabular-nums">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Panel with Chart / Table toggle
// ---------------------------------------------------------------------------
export interface ChartTable {
  headers: string[];
  rows: (string | number)[][];
}

export function ChartPanel({
  title,
  description,
  icon,
  table,
  legend,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  table: ChartTable;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Panel
      title={title}
      description={description}
      icon={icon}
      className={className}
      actions={
        <div className="flex items-center rounded-lg border bg-muted/50 p-0.5" role="tablist" aria-label={`${title} view`}>
          {(
            [
              { v: 'chart', icon: BarChart3, label: 'Chart view' },
              { v: 'table', icon: Table2, label: 'Table view' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              role="tab"
              aria-selected={view === opt.v}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => setView(opt.v)}
              className={cn(
                'flex size-7 items-center justify-center rounded-md transition-colors',
                view === opt.v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700',
              )}
            >
              <opt.icon className="size-3.5" />
            </button>
          ))}
        </div>
      }
    >
      {view === 'chart' ? (
        <div className="space-y-3">
          {legend}
          {children}
        </div>
      ) : (
        <div className="scrollbar-thin max-h-[300px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={h} className={cn('px-3 py-2', i > 0 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className={cn('px-3 py-1.5', ci > 0 ? 'text-right tabular-nums text-slate-900' : 'text-slate-600')}>
                      {typeof cell === 'number' ? fmt(cell) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Chart forms
// ---------------------------------------------------------------------------
type Row = Record<string, string | number>;

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/** Stacked columns over a category axis (days / weeks). Top series gets the rounded cap. */
export function StackedColumns({
  data,
  xKey,
  series,
  height = 260,
  xTickFormatter,
  tooltipLabel,
  minTickGap = 12,
}: {
  data: Row[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  xTickFormatter?: (value: string) => string;
  tooltipLabel?: (value: string) => string;
  minTickGap?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={xTickFormatter}
            minTickGap={minTickGap}
            interval="preserveStartEnd"
          />
          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={CURSOR}
            content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} formatLabel={tooltipLabel} showTotal />}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="stack"
              fill={s.color}
              stroke={SURFACE}
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series columns with an optional value label on the tallest bar. */
export function Columns({
  data,
  xKey,
  yKey,
  name,
  color = SERIES.teal,
  height = 220,
  unit,
  xTickFormatter,
  tooltipLabel,
  labelPeak = true,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  name: string;
  color?: string;
  height?: number;
  unit?: string;
  xTickFormatter?: (value: string) => string;
  tooltipLabel?: (value: string) => string;
  labelPeak?: boolean;
}) {
  const peak = Math.max(0, ...data.map((d) => Number(d[yKey] ?? 0)));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: -12 }} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={xTickFormatter} interval="preserveStartEnd" minTickGap={8} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
          <Tooltip cursor={CURSOR} content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} formatLabel={tooltipLabel} unit={unit} />} />
          <Bar dataKey={yKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36}>
            {labelPeak && peak > 0 && (
              <LabelList
                dataKey={yKey}
                position="top"
                className="fill-slate-600"
                fontSize={11}
                fontWeight={600}
                formatter={(v: unknown) => (Number(v) === peak ? fmt(Number(v)) : '')}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars for ranked categories, value printed at each bar tip. */
export function HorizontalBars({
  data,
  labelKey,
  valueKey,
  name,
  color = SERIES.teal,
  unit,
  labelWidth = 150,
}: {
  data: Row[];
  labelKey: string;
  valueKey: string;
  name: string;
  color?: string;
  unit?: string;
  labelWidth?: number;
}) {
  const height = Math.max(160, data.length * 30 + 16);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }} barCategoryGap="28%">
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey={labelKey}
            width={labelWidth}
            tick={{ fontSize: 12, fill: '#334155' }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip cursor={CURSOR} content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} unit={unit} />} />
          <Bar dataKey={valueKey} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList
              dataKey={valueKey}
              position="right"
              className="fill-slate-600"
              fontSize={11}
              fontWeight={600}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut with centre total; segments separated by 2px surface gaps. Legend rows carry the counts. */
export function Donut({
  data,
  centerLabel,
  size = 200,
  layout = 'row',
}: {
  data: { key: string; label: string; value: number; color: string }[];
  centerLabel: string;
  size?: number;
  /** 'column' stacks the legend under the ring (for narrow panels). */
  layout?: 'row' | 'column';
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const visible = data.filter((d) => d.value > 0);
  return (
    <div className={cn('flex flex-col items-center gap-5', layout === 'row' && 'sm:flex-row sm:items-center')}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} />} />
            <Pie
              data={visible}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="98%"
              stroke={SURFACE}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {visible.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] leading-none font-semibold text-slate-900">{fmt(total)}</span>
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {data.map((d) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={d.key} className="flex items-center gap-2.5 text-[13px]">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: d.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-slate-600">{d.label}</span>
              <span className="font-semibold text-slate-900 tabular-nums">{fmt(d.value)}</span>
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
