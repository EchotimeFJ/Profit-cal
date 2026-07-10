import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, History, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import {
  formatAssetPrice,
  formatAssetQuantity,
  formatCurrency,
  formatNumber,
  formatPercent,
  getAssetTypeLabel,
} from '../lib/utils';
import { ClosedPositionItem, ClosedPositionsData } from '../types';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const formatDays = (days: number | null | undefined) => {
  if (days === null || days === undefined) return '--';
  return `${days} 天`;
};

const profitColor = (value: number) => (
  value >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)'
);

const positionKey = (position: ClosedPositionItem) => {
  const recordIds = position.records.map((record) => record.id).join(',');
  return `${position.asset_id}-${position.first_buy_at}-${position.closed_at}-${recordIds}`;
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-surface-soft p-3">
    <p className="text-caption text-muted">{label}</p>
    <p className="font-number mt-1 text-body-sm font-semibold text-ink">{value}</p>
  </div>
);

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}> = ({ icon, label, value, hint }) => (
  <div className="rounded-2xl border border-hairline bg-canvas p-4">
    <div className="flex items-center gap-2 text-muted">
      {icon}
      <span className="text-caption">{label}</span>
    </div>
    <p className="font-number mt-2 text-title-sm font-semibold text-ink">{value}</p>
    {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
  </div>
);

const ClosedPositionCard: React.FC<{
  position: ClosedPositionItem;
  expanded: boolean;
  onToggle: () => void;
}> = ({ position, expanded, onToggle }) => (
  <article className="rounded-2xl border border-hairline bg-canvas p-4 sm:p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title-sm font-semibold text-ink">{position.asset_name}</h3>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption text-muted">
            {getAssetTypeLabel(position.asset_type)}
          </span>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption text-muted">
            {position.currency}
          </span>
        </div>
        <p className="mt-1 break-all text-body-sm text-muted">{position.symbol}</p>
        <p className="mt-2 text-body-sm text-muted">
          {formatDateTime(position.first_buy_at)} 至 {formatDateTime(position.closed_at)} · 持仓 {formatDays(position.holding_days)}
        </p>
      </div>
      <div className="text-left lg:text-right">
        <p className="font-number text-title-md font-semibold" style={{ color: profitColor(position.realized_profit) }}>
          {formatCurrency(position.realized_profit, position.currency)}
        </p>
        <p className="font-number text-body-sm" style={{ color: profitColor(position.realized_profit) }}>
          {position.realized_profit_percent !== null ? formatPercent(position.realized_profit_percent) : '--'}
        </p>
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="投入成本" value={formatCurrency(position.total_cost, position.currency)} />
      <Metric label="卖出金额" value={formatCurrency(position.total_proceeds, position.currency)} />
      <Metric label="买入数量" value={formatAssetQuantity(position.buy_quantity, position.asset_type)} />
      <Metric label="卖出数量" value={formatAssetQuantity(position.sell_quantity, position.asset_type)} />
    </div>

    <button
      type="button"
      onClick={onToggle}
      className="mt-4 inline-flex items-center gap-2 text-body-sm font-semibold text-coinbase-blue"
      aria-expanded={expanded}
    >
      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      {expanded ? '收起交易时间线' : '展开交易时间线'}
    </button>

    {expanded && (
      <div className="mt-4 space-y-3 border-t border-hairline pt-4">
        {position.records.map((record) => (
          <div key={record.id} className="rounded-xl bg-surface-soft p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="rounded-full bg-canvas px-2 py-0.5 text-caption font-semibold text-ink">
                  {record.action === 'buy' ? '买入' : '卖出'}
                </span>
                <p className="mt-2 text-body-sm text-muted">{formatDateTime(record.created_at)}</p>
                <p className="mt-1 text-body-sm text-muted">
                  {formatAssetQuantity(record.quantity, record.asset_type)} · {formatAssetPrice(record.price, record.currency, record.asset_type)}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-number text-body-sm font-semibold text-ink">
                  {formatCurrency(record.amount, record.currency)}
                </p>
                {record.action === 'sell' && (
                  <p className="font-number text-body-sm" style={{ color: profitColor(record.realized_profit || 0) }}>
                    {formatCurrency(record.realized_profit || 0, record.currency)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </article>
);

export const ClosedPositionAnalytics: React.FC = () => {
  const [data, setData] = useState<ClosedPositionsData | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<ClosedPositionsData>('/analytics/closed-positions');
      setData({
        summary: response.summary,
        positions: Array.isArray(response.positions) ? response.positions : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '历史分析加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const summary = data?.summary;
  const positions = data?.positions || [];

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 p-4 pb-24 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-body-sm text-muted">投资闭环</p>
          <h1 className="mt-1 text-title-lg font-semibold text-ink">历史分析</h1>
          <p className="mt-2 text-body-sm text-muted">
            这里只展示已经完全卖出的清仓资产，当前持仓继续在持仓详情页查看。
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to="/dashboard"
            className="inline-flex w-full items-center justify-center rounded-pill bg-surface-strong px-5 py-3 text-button font-semibold text-ink transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-coinbase-blue focus:ring-offset-2 sm:w-auto"
          >
            返回主页
          </Link>
          <Button onClick={fetchAnalytics} disabled={loading} className="w-full sm:w-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-hairline bg-surface-soft p-4 text-body-sm text-semantic-down">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={<History className="h-4 w-4" />} label="已清仓资产" value={`${summary?.closed_count ?? 0}`} />
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="总已实现收益"
          value={formatNumber(summary?.total_realized_profit ?? 0)}
          hint="无币种汇总，多币种未折算，仅作参考"
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="胜率"
          value={summary?.win_rate !== null && summary?.win_rate !== undefined ? formatPercent(summary.win_rate) : '--'}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="平均收益率"
          value={
            summary?.average_realized_profit_percent !== null && summary?.average_realized_profit_percent !== undefined
              ? formatPercent(summary.average_realized_profit_percent)
              : '--'
          }
        />
        <SummaryCard icon={<History className="h-4 w-4" />} label="平均持仓天数" value={formatDays(summary?.average_holding_days)} />
      </section>

      {loading ? (
        <div className="rounded-2xl border border-hairline bg-canvas p-8 text-center text-body-sm text-muted">
          加载清仓复盘中...
        </div>
      ) : positions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-surface-soft p-8 text-center">
          <History className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-3 text-body-md font-semibold text-ink">暂无清仓复盘</p>
          <p className="mt-1 text-body-sm text-muted">完成一次清仓卖出后会在这里生成复盘。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map((position) => {
            const key = positionKey(position);
            return (
              <ClosedPositionCard
                key={key}
                position={position}
                expanded={expandedKeys.has(key)}
                onToggle={() => toggleExpanded(key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
