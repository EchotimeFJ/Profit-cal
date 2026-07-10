import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Bell, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import {
  formatAssetPrice,
  formatAssetQuantity,
  formatCurrency,
  formatPercent,
  getAssetTypeLabel,
} from '../lib/utils';
import { AssetDetailData } from '../types';

const valueColor = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'var(--color-muted)';
  return value >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

export const AssetDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<AssetDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get<AssetDetailData>(`/assets/${id}/detail`);
      setData(response);
    } catch (err: unknown) {
      setData(null);
      setError(err instanceof Error ? err.message : '加载持仓详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6 text-muted">
        正在加载持仓详情...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card-light p-6">
          <p className="text-title-sm font-semibold text-ink">{error || '当前持仓不存在或已清仓'}</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/dashboard')}>
            返回主页
          </Button>
        </div>
      </div>
    );
  }

  const { asset, price, performance, records } = data;

  return (
    <div className="mx-auto max-w-[1120px] space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-muted no-underline hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          返回总览
        </Link>
        <Button variant="secondary" onClick={fetchDetail}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新详情
        </Button>
      </div>

      <section className="card-light p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-body-sm text-muted">
              {getAssetTypeLabel(asset.asset_type)} · {asset.currency}
            </p>
            <h1 className="mt-1 text-title-lg font-semibold text-ink">{asset.name}</h1>
            <p className="text-body-md text-muted">{asset.symbol}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              <Plus className="mr-2 h-4 w-4" />
              加仓
            </Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              <Banknote className="mr-2 h-4 w-4" />
              卖出
            </Button>
            <Link to="/alerts" className="no-underline">
              <Button variant="outline" className="w-full">
                <Bell className="mr-2 h-4 w-4" />
                提醒
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">当前价格</p>
          <p className="mt-2 font-number text-title-lg font-semibold text-ink">
            {price.current_price !== null ? formatAssetPrice(price.current_price, asset.currency, asset.asset_type) : '--'}
          </p>
          <p className="mt-1 text-body-sm text-muted">
            {price.source || '暂无来源'} {formatDateTime(price.quote_time)}
          </p>
          {price.error && <p className="mt-2 text-body-sm text-semantic-down">{price.error}</p>}
        </div>
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">当前持仓</p>
          <p className="mt-2 text-title-md font-semibold text-ink">
            {formatAssetQuantity(asset.quantity, asset.asset_type)}
          </p>
          <p className="mt-1 text-body-sm text-muted">
            平均成本 {formatAssetPrice(asset.buy_price, asset.currency, asset.asset_type)}
          </p>
        </div>
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">持仓市值</p>
          <p className="mt-2 font-number text-title-md font-semibold text-ink">
            {performance.current_value !== null ? formatCurrency(performance.current_value, asset.currency) : '--'}
          </p>
          <p className="mt-1 text-body-sm text-muted">
            投入 {formatCurrency(performance.investment, asset.currency)}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">未实现收益</p>
          <p className="mt-2 font-number text-title-md font-semibold" style={{ color: valueColor(performance.unrealized_profit) }}>
            {performance.unrealized_profit !== null ? formatCurrency(performance.unrealized_profit, asset.currency) : '--'}
          </p>
          <p className="mt-1 font-number text-body-sm" style={{ color: valueColor(performance.unrealized_profit_percent) }}>
            {performance.unrealized_profit_percent !== null ? formatPercent(performance.unrealized_profit_percent) : '--'}
          </p>
        </div>
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">今日收益</p>
          <p className="mt-2 font-number text-title-md font-semibold" style={{ color: valueColor(performance.daily_profit) }}>
            {performance.daily_profit !== null ? formatCurrency(performance.daily_profit, asset.currency) : '--'}
          </p>
          <p className="mt-1 font-number text-body-sm" style={{ color: valueColor(performance.daily_profit_percent) }}>
            {performance.daily_profit_percent !== null ? formatPercent(performance.daily_profit_percent) : '--'}
          </p>
        </div>
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">已实现收益</p>
          <p className="mt-2 font-number text-title-md font-semibold" style={{ color: valueColor(performance.realized_profit) }}>
            {formatCurrency(performance.realized_profit, asset.currency)}
          </p>
          <p className="mt-1 font-number text-body-sm" style={{ color: valueColor(performance.realized_profit_percent) }}>
            {performance.realized_profit_percent !== null ? formatPercent(performance.realized_profit_percent) : '--'}
          </p>
        </div>
      </section>

      <section className="card-light p-5 sm:p-6">
        <h2 className="text-title-sm font-semibold text-ink">交易时间线</h2>
        <div className="mt-4 space-y-3">
          {records.map((record) => (
            <div key={record.id} className="flex flex-col gap-2 rounded-2xl border border-hairline p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-body-md font-semibold text-ink">
                  {record.action === 'buy' ? '买入/加仓' : '卖出'}
                </p>
                <p className="text-body-sm text-muted">{formatDateTime(record.created_at)}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-number text-body-md text-ink">
                  {formatAssetQuantity(record.quantity, record.asset_type)} · {formatAssetPrice(record.price, record.currency, record.asset_type)}
                </p>
                {record.realized_profit !== null && (
                  <p className="font-number text-body-sm" style={{ color: valueColor(record.realized_profit) }}>
                    {formatCurrency(record.realized_profit, record.currency)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
