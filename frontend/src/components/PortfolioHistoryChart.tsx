import React, { useId } from 'react';
import { formatCurrency, formatPercent } from '../lib/utils';
import { PortfolioHistoryPoint } from '../types';

interface PortfolioHistoryChartProps {
  currency: string;
  points: PortfolioHistoryPoint[];
  error?: string;
  onRetry?: () => void;
}

type MetricKey = 'total_current_value' | 'total_profit';

const chartWidth = 640;
const chartHeight = 116;
const chartPadding = 12;

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const safeFormatCurrency = (value: unknown, currency: string) => (
  isFiniteNumber(value) ? formatCurrency(value, currency) : '--'
);

const safeFormatPercent = (value: unknown) => (
  isFiniteNumber(value) ? formatPercent(value) : '--'
);

const metricPointValue = (point: PortfolioHistoryPoint, key: MetricKey) => point[key];

const validMetricPoints = (points: PortfolioHistoryPoint[], key: MetricKey) => (
  points.filter((point) => isFiniteNumber(metricPointValue(point, key)))
);

const pointCoordinates = (
  value: number,
  index: number,
  count: number,
  min: number,
  max: number
) => {
  const span = max - min;
  const drawableWidth = chartWidth - chartPadding * 2;
  const drawableHeight = chartHeight - chartPadding * 2;
  const x = chartPadding + (index / Math.max(count - 1, 1)) * drawableWidth;
  const y = span === 0
    ? chartHeight / 2
    : chartPadding + drawableHeight - ((value - min) / span) * drawableHeight;
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

const formatDateLabel = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

const MiniMetricChart: React.FC<{
  title: string;
  description: string;
  currency: string;
  points: PortfolioHistoryPoint[];
  metricKey: MetricKey;
  stroke: string;
  dashed?: boolean;
}> = ({ title, description, currency, points, metricKey, stroke, dashed = false }) => {
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

      {metricPoints.length < 2 ? (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-hairline text-body-sm text-muted">
          暂无足够有效点位
        </div>
      ) : (
        <svg
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-28 min-w-[520px] w-full"
        >
          <title id={titleId}>{title}</title>
          <desc id={descId}>
            {description}，时间范围 {formatDateLabel(first.date)} 至 {formatDateLabel(latest.date)}，最新值 {formatCurrency(metricPointValue(latest, metricKey), currency)}。
          </desc>
          {[0, 1, 2].map((line) => {
            const y = chartPadding + (line / 2) * (chartHeight - chartPadding * 2);
            return (
              <line
                key={line}
                x1={chartPadding}
                x2={chartWidth - chartPadding}
                y1={y}
                y2={y}
                stroke="var(--color-hairline)"
                strokeDasharray="4 6"
              />
            );
          })}
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashed ? '10 8' : undefined}
          />
          {latestCoordinates && (
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
      )}
    </div>
  );
};

export const PortfolioHistoryChart: React.FC<PortfolioHistoryChartProps> = ({ currency, points, error, onRetry }) => {
  const safePoints = Array.isArray(points) ? points : [];
  const latest = safePoints[safePoints.length - 1];
  const first = safePoints[0];
  const latestProfitColor = (latest?.total_profit ?? 0) >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';
  const hasEnoughPoints = (
    validMetricPoints(safePoints, 'total_current_value').length >= 2 ||
    validMetricPoints(safePoints, 'total_profit').length >= 2
  );

  return (
    <section className="card-light p-5 sm:p-6" style={{ marginBottom: '32px' }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-body-sm text-muted">组合历史净值</p>
          <h2 className="text-title-sm font-semibold text-ink">总市值与累计收益趋势</h2>
          <p className="mt-1 text-body-sm text-muted">
            基于手动刷新生成的每日快照，历史查询不会写入数据。
          </p>
        </div>
        {latest && (
          <div className="text-left sm:text-right">
            <p className="font-number text-title-sm font-semibold text-ink">
              {safeFormatCurrency(latest.total_current_value, currency)}
            </p>
            <p className="font-number text-body-sm" style={{ color: latestProfitColor }}>
              {safeFormatCurrency(latest.total_profit, currency)} · {safeFormatPercent(latest.total_profit_percent)}
            </p>
          </div>
        )}
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
      ) : !hasEnoughPoints ? (
        <div className="mt-5 rounded-2xl border border-dashed border-hairline bg-surface-soft p-6 text-center">
          <p className="text-body-sm font-semibold text-ink">暂无足够历史数据</p>
          <p className="mt-1 text-body-sm text-muted">暂无足够历史数据，今天开始记录。</p>
          <p className="mt-1 text-caption text-muted">点击刷新会生成或更新今天的组合快照。</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <div className="grid min-w-[520px] gap-3">
            <MiniMetricChart
              title="总市值趋势"
              description="组合总市值，使用独立纵轴展示变化方向"
              currency={currency}
              points={safePoints}
              metricKey="total_current_value"
              stroke="var(--color-coinbase-blue)"
            />
            <MiniMetricChart
              title="累计收益趋势"
              description="组合累计收益，虚线用于和总市值区分"
              currency={currency}
              points={safePoints}
              metricKey="total_profit"
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
                {formatDateLabel(first.date)} 至 {formatDateLabel(latest.date)}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
