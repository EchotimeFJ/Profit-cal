import React, { useId } from 'react';
import { formatCurrency, formatPercent } from '../lib/utils';
import { PortfolioHistoryPoint, PortfolioHistoryRange } from '../types';

interface PortfolioHistoryChartProps {
  currency: string;
  points: PortfolioHistoryPoint[];
  selectedRange: PortfolioHistoryRange;
  onRangeChange: (range: PortfolioHistoryRange) => void;
  error?: string;
  onRetry?: () => void;
}

type MetricKey = 'total_current_value' | 'total_profit';

const chartWidth = 720;
const chartHeight = 188;
const chartTopPadding = 14;
const chartRightPadding = 14;
const chartBottomPadding = 34;
const chartLeftPadding = 86;
const historyRanges: Array<{ value: PortfolioHistoryRange; label: string }> = [
  { value: '1d', label: '1日' },
  { value: '3d', label: '3日' },
  { value: '7d', label: '7日' },
];

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isHistoryPoint = (value: unknown): value is PortfolioHistoryPoint => (
  Boolean(value) && typeof value === 'object'
);

const safeFormatCurrency = (value: unknown, currency: string) => (
  isFiniteNumber(value) ? formatCurrency(value, currency) : '--'
);

const safeFormatPercent = (value: unknown) => (
  isFiniteNumber(value) ? formatPercent(value) : '--'
);

const currencySymbol = (currency: string) => {
  const symbols: Record<string, string> = {
    CNY: '¥',
    USD: '$',
    HKD: 'HK$',
    USDT: '₮',
  };
  return symbols[currency] || currency;
};

const formatAxisCurrency = (value: number, currency: string) => {
  const symbol = currencySymbol(currency);
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 100000000) {
    return `${sign}${symbol}${(absValue / 100000000).toFixed(1)}亿`;
  }
  if (absValue >= 10000) {
    return `${sign}${symbol}${(absValue / 10000).toFixed(1)}万`;
  }
  return `${sign}${symbol}${absValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
};

const metricPointValue = (point: PortfolioHistoryPoint, key: MetricKey) => point[key];

const normalizeHistoryPoints = (points: unknown): PortfolioHistoryPoint[] => (
  Array.isArray(points) ? points.filter(isHistoryPoint) : []
);

const validMetricPoints = (points: unknown, key: MetricKey) => (
  normalizeHistoryPoints(points).filter((point) => isFiniteNumber(metricPointValue(point, key)))
);

const chartBounds = {
  left: chartLeftPadding,
  top: chartTopPadding,
  right: chartWidth - chartRightPadding,
  bottom: chartHeight - chartBottomPadding,
};

const buildTicks = (min: number, max: number) => {
  if (min === max) {
    const delta = Math.max(Math.abs(min) * 0.05, 1);
    return [min + delta, min, min - delta];
  }

  return [max, (min + max) / 2, min];
};

const pointCoordinates = (
  value: number,
  index: number,
  count: number,
  min: number,
  max: number
) => {
  const span = max - min;
  const drawableWidth = chartBounds.right - chartBounds.left;
  const drawableHeight = chartBounds.bottom - chartBounds.top;
  const x = count === 1
    ? chartBounds.right
    : chartBounds.left + (index / Math.max(count - 1, 1)) * drawableWidth;
  const y = span === 0
    ? chartBounds.top + drawableHeight / 2
    : chartBounds.top + drawableHeight - ((value - min) / span) * drawableHeight;
  return { x, y };
};

const buildPath = (metricPoints: PortfolioHistoryPoint[], key: MetricKey) => {
  if (metricPoints.length < 2) return '';

  const values = metricPoints.map((point) => metricPointValue(point, key));
  const min = Math.min(...values);
  const max = Math.max(...values);

  return metricPoints
    .map((point, index) => {
      const { x, y } = pointCoordinates(metricPointValue(point, key), index, metricPoints.length, min, max);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

const pointTimeValue = (point: PortfolioHistoryPoint) => point.timestamp || point.date || '';

const normalizeUtcTimeValue = (value: string) => {
  if (!value) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return value;
  if (/[T\s]\d{2}:\d{2}/.test(value)) return `${value.replace(' ', 'T')}Z`;
  return value;
};

const parsePointTime = (point: PortfolioHistoryPoint) => {
  const value = pointTimeValue(point);
  const date = new Date(normalizeUtcTimeValue(value));
  if (!Number.isNaN(date.getTime())) return date;
  return null;
};

const formatDateLabel = (point: PortfolioHistoryPoint) => {
  const date = parsePointTime(point);
  if (!date) return pointTimeValue(point);
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatAxisDateLabel = (point: PortfolioHistoryPoint, range: PortfolioHistoryRange) => {
  const date = parsePointTime(point);
  if (!date) return pointTimeValue(point);
  if (range === '1d') {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    hour12: false,
  });
};

const xAxisLabels = (points: PortfolioHistoryPoint[], range: PortfolioHistoryRange) => {
  if (points.length === 0) return [];
  if (points.length <= 4) {
    return points.map((point, index) => ({ point, index, label: formatAxisDateLabel(point, range) }));
  }

  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  return points
    .map((point, index) => ({ point, index, label: formatAxisDateLabel(point, range) }))
    .filter((item) => labelIndexes.has(item.index));
};

const MiniMetricChart: React.FC<{
  title: string;
  description: string;
  currency: string;
  points: PortfolioHistoryPoint[];
  metricKey: MetricKey;
  range: PortfolioHistoryRange;
  stroke: string;
  dashed?: boolean;
}> = ({ title, description, currency, points, metricKey, range, stroke, dashed = false }) => {
  const titleId = useId();
  const descId = useId();
  const metricPoints = validMetricPoints(points, metricKey);
  const path = buildPath(metricPoints, metricKey);
  const latest = metricPoints[metricPoints.length - 1];
  const first = metricPoints[0];
  const values = metricPoints.map((point) => metricPointValue(point, metricKey));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const latestCoordinates = latest
    ? pointCoordinates(metricPointValue(latest, metricKey), metricPoints.length - 1, metricPoints.length, min, max)
    : null;
  const ticks = buildTicks(min, max);
  const labels = xAxisLabels(metricPoints, range);

  return (
    <div className="rounded-2xl bg-surface-soft p-4">
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-body-sm font-semibold text-ink">{title}</p>
          <p className="text-caption text-muted">{description}</p>
        </div>
        {latest && (
          <p className="font-number text-body-sm font-semibold text-ink">
            {formatCurrency(metricPointValue(latest, metricKey), currency)}
          </p>
        )}
      </div>

      <svg
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="h-44 w-full min-w-0"
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>
          {description}
          {first && latest
            ? `，时间范围 ${formatDateLabel(first)} 至 ${formatDateLabel(latest)}，最新值 ${formatCurrency(metricPointValue(latest, metricKey), currency)}。`
            : '，暂无有效点位。'}
        </desc>
        <line
          x1={chartBounds.left}
          x2={chartBounds.left}
          y1={chartBounds.top}
          y2={chartBounds.bottom}
          stroke="var(--color-hairline)"
        />
        <line
          x1={chartBounds.left}
          x2={chartBounds.right}
          y1={chartBounds.bottom}
          y2={chartBounds.bottom}
          stroke="var(--color-hairline)"
        />
        {ticks.map((tick, index) => {
          const y = chartBounds.top + (index / Math.max(ticks.length - 1, 1)) * (chartBounds.bottom - chartBounds.top);
          return (
            <g key={`${tick}-${index}`}>
              <line
                x1={chartBounds.left}
                x2={chartBounds.right}
                y1={y}
                y2={y}
                stroke="var(--color-hairline)"
                strokeDasharray="4 6"
              />
              <text
                x={chartBounds.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-muted font-number text-[11px]"
              >
                {formatAxisCurrency(tick, currency)}
              </text>
            </g>
          );
        })}
        {labels.map(({ point, index, label }) => {
          const x = pointCoordinates(metricPointValue(point, metricKey), index, metricPoints.length, min, max).x;
          return (
            <text
              key={`${pointTimeValue(point)}-${index}`}
              x={x}
              y={chartBounds.bottom + 24}
              textAnchor={metricPoints.length === 1 ? 'end' : index === 0 ? 'start' : index === metricPoints.length - 1 ? 'end' : 'middle'}
              className="fill-muted text-[11px]"
            >
              {label}
            </text>
          );
        })}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashed ? '10 8' : undefined}
          />
        )}
        {metricPoints.length === 1 && latestCoordinates && (
          <circle
            cx={latestCoordinates.x}
            cy={latestCoordinates.y}
            r="5"
            fill={stroke}
          />
        )}
        {latestCoordinates && metricPoints.length > 1 && (
          <circle
            cx={latestCoordinates.x}
            cy={latestCoordinates.y}
            r="5"
            fill="var(--color-canvas)"
            stroke={stroke}
            strokeWidth="3"
          />
        )}
      </svg>
      {metricPoints.length < 2 && (
        <p className="mt-2 text-caption text-muted">当前范围内点位不足，先显示坐标轴和最新快照点。</p>
      )}
    </div>
  );
};

export const PortfolioHistoryChart: React.FC<PortfolioHistoryChartProps> = ({
  currency,
  points,
  selectedRange,
  onRangeChange,
  error,
  onRetry,
}) => {
  const safePoints = normalizeHistoryPoints(points);
  const latest = safePoints[safePoints.length - 1];
  const first = safePoints[0];
  const latestProfitColor = (latest?.total_profit ?? 0) >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';
  const hasAnyPoints = (
    validMetricPoints(safePoints, 'total_current_value').length > 0 ||
    validMetricPoints(safePoints, 'total_profit').length > 0
  );

  return (
    <section className="card-light p-5 sm:p-6" style={{ marginBottom: '32px' }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-body-sm text-muted">组合历史净值</p>
          <h2 className="text-title-sm font-semibold text-ink">总市值与累计收益趋势</h2>
          <p className="mt-1 text-body-sm text-muted">
            系统自动记录组合历史，后台采集完成后会按所选时间范围展示分钟级快照。
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="inline-flex rounded-full border border-hairline bg-surface-soft p-1" aria-label="选择历史净值时间范围">
            {historyRanges.map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => onRangeChange(range.value)}
                className={`rounded-full px-3 py-1.5 text-caption font-semibold transition-colors ${
                  selectedRange === range.value
                    ? 'bg-coinbase-blue text-white'
                    : 'text-muted hover:text-ink'
                }`}
                aria-pressed={selectedRange === range.value}
              >
                {range.label}
              </button>
            ))}
          </div>
          {latest && (
            <div className="text-left lg:text-right">
              <p className="font-number text-title-sm font-semibold text-ink">
                {safeFormatCurrency(latest.total_current_value, currency)}
              </p>
              <p className="font-number text-body-sm" style={{ color: latestProfitColor }}>
                {safeFormatCurrency(latest.total_profit, currency)} · {safeFormatPercent(latest.total_profit_percent)}
              </p>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-dashed border-hairline bg-surface-soft p-6 text-center">
          <p className="text-body-sm font-semibold text-semantic-down">历史净值加载失败</p>
          <p className="mt-1 text-body-sm text-muted">{error}</p>
          {onRetry && (
            <button type="button" className="mt-3 text-body-sm font-semibold text-coinbase-blue" onClick={onRetry}>
              重试
            </button>
          )}
        </div>
      ) : !hasAnyPoints ? (
        <div className="mt-5 rounded-2xl border border-dashed border-hairline bg-surface-soft p-6 text-center">
          <p className="text-body-sm font-semibold text-ink">暂无自动历史快照</p>
          <p className="mt-1 text-body-sm text-muted">后台分钟级采集运行后，这里会自动显示组合历史曲线。</p>
          <p className="mt-1 text-caption text-muted">当前视图不会提示手动刷新来生成历史数据。</p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden">
          <div className="grid min-w-0 gap-3">
            <MiniMetricChart
              title="总市值趋势"
              description="左侧为金额纵轴，底部为时间轴"
              currency={currency}
              points={safePoints}
              metricKey="total_current_value"
              range={selectedRange}
              stroke="var(--color-coinbase-blue)"
            />
            <MiniMetricChart
              title="累计收益趋势"
              description="左侧为金额纵轴，底部为时间轴"
              currency={currency}
              points={safePoints}
              metricKey="total_profit"
              range={selectedRange}
              stroke="var(--color-semantic-up)"
              dashed
            />
          </div>
          <div className="mt-3 flex flex-col gap-2 text-caption text-muted sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-5 rounded-full" style={{ backgroundColor: 'var(--color-coinbase-blue)' }} />
                总市值
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-5 border-t-2 border-dashed" style={{ borderColor: 'var(--color-semantic-up)' }} />
                累计收益（虚线）
              </span>
            </div>
            {first && latest && (
              <span>
                {historyRanges.find((range) => range.value === selectedRange)?.label} · {formatDateLabel(first)} 至 {formatDateLabel(latest)}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
