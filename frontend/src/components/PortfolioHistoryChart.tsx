import React from 'react';
import { formatCurrency, formatPercent } from '../lib/utils';
import { PortfolioHistoryPoint } from '../types';

interface PortfolioHistoryChartProps {
  currency: string;
  points: PortfolioHistoryPoint[];
}

const chartWidth = 640;
const chartHeight = 180;
const chartPadding = 12;

const buildPath = (values: number[]) => {
  if (values.length < 2) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const drawableWidth = chartWidth - chartPadding * 2;
  const drawableHeight = chartHeight - chartPadding * 2;

  return values
    .map((value, index) => {
      const x = chartPadding + (index / (values.length - 1)) * drawableWidth;
      const y = chartPadding + drawableHeight - ((value - min) / span) * drawableHeight;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

const formatDateLabel = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

export const PortfolioHistoryChart: React.FC<PortfolioHistoryChartProps> = ({ currency, points }) => {
  const latest = points[points.length - 1];
  const first = points[0];
  const valuePath = buildPath(points.map((point) => point.total_current_value));
  const profitPath = buildPath(points.map((point) => point.total_profit));
  const latestProfitColor = (latest?.total_profit ?? 0) >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';

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
              {formatCurrency(latest.total_current_value, currency)}
            </p>
            <p className="font-number text-body-sm" style={{ color: latestProfitColor }}>
              {formatCurrency(latest.total_profit, currency)} · {formatPercent(latest.total_profit_percent)}
            </p>
          </div>
        )}
      </div>

      {points.length < 2 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-hairline bg-surface-soft p-6 text-center">
          <p className="text-body-sm font-semibold text-ink">暂无足够历史数据</p>
          <p className="mt-1 text-body-sm text-muted">点击刷新会生成或更新今天的组合快照。</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <svg
            role="img"
            aria-label="组合历史净值趋势图"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="h-48 min-w-[520px] w-full"
          >
            <defs>
              <linearGradient id="portfolio-history-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-coinbase-blue)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--color-coinbase-blue)" stopOpacity="0" />
              </linearGradient>
            </defs>
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
              d={`${valuePath} L ${chartWidth - chartPadding} ${chartHeight - chartPadding} L ${chartPadding} ${chartHeight - chartPadding} Z`}
              fill="url(#portfolio-history-fill)"
            />
            <path d={valuePath} fill="none" stroke="var(--color-coinbase-blue)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d={profitPath} fill="none" stroke="var(--color-semantic-up)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
          </svg>
          <div className="mt-3 flex flex-col gap-2 text-caption text-muted sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-5 rounded-full" style={{ backgroundColor: 'var(--color-coinbase-blue)' }} />
                总市值
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-5 rounded-full" style={{ backgroundColor: 'var(--color-semantic-up)' }} />
                累计收益
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
