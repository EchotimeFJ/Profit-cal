import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Banknote, Bell, Plus, RefreshCw, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ApiError, api } from '../lib/api';
import {
  formatAssetPrice,
  formatAssetQuantity,
  formatCurrency,
  formatPercent,
  formatQuantityValue,
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

const initialTradeFormData = {
  price: '',
  quantity: '',
  amount: '',
};

export const AssetDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const requestSeq = useRef(0);
  const [data, setData] = useState<AssetDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cleared, setCleared] = useState(false);
  const [showAddPositionModal, setShowAddPositionModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [addPositionFormData, setAddPositionFormData] = useState(initialTradeFormData);
  const [sellFormData, setSellFormData] = useState(initialTradeFormData);

  const fetchDetail = useCallback(async () => {
    if (!id) {
      setData(null);
      setError('缺少持仓 ID');
      setCleared(false);
      setLoading(false);
      return;
    }

    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setLoading(true);
    setError('');
    setCleared(false);
    try {
      const response = await api.get<AssetDetailData>(`/assets/${id}/detail`);
      if (requestSeq.current !== requestId) return;
      setData(response);
    } catch (err: unknown) {
      if (requestSeq.current !== requestId) return;
      setData(null);
      if (err instanceof ApiError && err.status === 404) {
        setCleared(true);
      } else {
        setError(err instanceof Error ? err.message : '加载持仓详情失败');
      }
    } finally {
      if (requestSeq.current === requestId) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
    return () => {
      requestSeq.current += 1;
    };
  }, [fetchDetail]);

  const handleOpenAddPosition = () => {
    setAddPositionFormData(initialTradeFormData);
    setShowAddPositionModal(true);
  };

  const handleOpenSell = () => {
    setSellFormData(initialTradeFormData);
    setShowSellModal(true);
  };

  const handleAddPositionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;

    try {
      await api.post(`/assets/${data.asset.id}/add-position`, {
        buy_price: parseFloat(addPositionFormData.price),
        quantity: addPositionFormData.quantity ? parseFloat(addPositionFormData.quantity) : undefined,
        amount: addPositionFormData.amount ? parseFloat(addPositionFormData.amount) : undefined,
      });
      setShowAddPositionModal(false);
      setAddPositionFormData(initialTradeFormData);
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '加仓失败');
    }
  };

  const handleSellSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;

    try {
      await api.post(`/assets/${data.asset.id}/sell`, {
        sell_price: parseFloat(sellFormData.price),
        quantity: sellFormData.quantity ? parseFloat(sellFormData.quantity) : undefined,
        amount: sellFormData.amount ? parseFloat(sellFormData.amount) : undefined,
      });
      setShowSellModal(false);
      setSellFormData(initialTradeFormData);
      await fetchDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '卖出失败');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6 text-muted">
        正在加载持仓详情...
      </div>
    );
  }

  if (error || cleared || !data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card-light p-6">
          <p className="text-title-sm font-semibold text-ink">
            {cleared ? '当前持仓已清仓或不存在' : error || '当前持仓不存在或已清仓'}
          </p>
          {cleared && (
            <p className="mt-2 text-body-sm text-muted">
              该资产已从当前持仓移除，交易记录仍保留在历史中。
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              返回总览
            </Button>
            <Button variant="outline" onClick={fetchDetail}>
              重新加载
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { asset, price, performance, records } = data;
  const tradeCurrency = asset.currency;

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
            <Button variant="secondary" onClick={handleOpenAddPosition}>
              <Plus className="mr-2 h-4 w-4" />
              加仓
            </Button>
            <Button variant="outline" onClick={handleOpenSell}>
              <Banknote className="mr-2 h-4 w-4" />
              卖出
            </Button>
            <Button variant="outline" onClick={() => navigate('/alerts')}>
              <Bell className="mr-2 h-4 w-4" />
              提醒
            </Button>
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

      <AnimatePresence>
        {showAddPositionModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowAddPositionModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: '100%', scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: '100%', scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full overflow-hidden rounded-t-2xl bg-canvas shadow-2xl sm:max-w-lg sm:rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-hairline px-6 py-5">
                <div>
                  <h2 className="text-title-md font-semibold text-ink">加仓资产</h2>
                  <p className="mt-1 text-body-sm text-muted">
                    {asset.name} · 当前持有 {formatAssetQuantity(asset.quantity, asset.asset_type)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowAddPositionModal(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <form onSubmit={handleAddPositionSubmit} className="space-y-5 px-6 py-6">
                <div>
                  <label className="mb-2 block text-caption font-medium text-ink">加仓价</label>
                  <Input
                    type="number"
                    step="0.001"
                    value={addPositionFormData.price}
                    onChange={(event) => setAddPositionFormData({ ...addPositionFormData, price: event.target.value })}
                    placeholder="加仓价格"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-caption font-medium text-ink">数量</label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={addPositionFormData.quantity}
                      onChange={(event) => setAddPositionFormData({ ...addPositionFormData, quantity: event.target.value, amount: '' })}
                      placeholder="数量"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-caption font-medium text-ink">或金额</label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        value={addPositionFormData.amount}
                        onChange={(event) => setAddPositionFormData({ ...addPositionFormData, amount: event.target.value, quantity: '' })}
                        placeholder="加仓金额"
                        className="pr-20"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body-sm font-medium text-muted">
                        {tradeCurrency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-surface-soft px-4 py-3 text-body-sm text-muted">
                  填写数量或金额其中之一即可，提交后会按加权平均法刷新当前持仓成本价。
                </div>

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                  <Button type="submit" className="flex-1">
                    确认加仓
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowAddPositionModal(false)}>
                    取消
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showSellModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowSellModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: '100%', scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: '100%', scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full overflow-hidden rounded-t-2xl bg-canvas shadow-2xl sm:max-w-lg sm:rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-hairline px-6 py-5">
                <div>
                  <h2 className="text-title-md font-semibold text-ink">卖出资产</h2>
                  <p className="mt-1 text-body-sm text-muted">
                    {asset.name} · 当前持有 {formatAssetQuantity(asset.quantity, asset.asset_type)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowSellModal(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <form onSubmit={handleSellSubmit} className="space-y-5 px-6 py-6">
                <div>
                  <label className="mb-2 block text-caption font-medium text-ink">卖出价</label>
                  <Input
                    type="number"
                    step="0.001"
                    value={sellFormData.price}
                    onChange={(event) => setSellFormData({ ...sellFormData, price: event.target.value })}
                    placeholder="卖出价格"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-caption font-medium text-ink">数量</label>
                      <button
                        type="button"
                        className="text-caption font-medium text-coinbase-blue"
                        onClick={() => setSellFormData({
                          ...sellFormData,
                          quantity: formatQuantityValue(asset.quantity),
                          amount: '',
                        })}
                      >
                        全部卖出
                      </button>
                    </div>
                    <Input
                      type="number"
                      step="0.000001"
                      value={sellFormData.quantity}
                      onChange={(event) => setSellFormData({ ...sellFormData, quantity: event.target.value, amount: '' })}
                      placeholder="数量"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-caption font-medium text-ink">或金额</label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        value={sellFormData.amount}
                        onChange={(event) => setSellFormData({ ...sellFormData, amount: event.target.value, quantity: '' })}
                        placeholder="卖出金额"
                        className="pr-20"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body-sm font-medium text-muted">
                        {tradeCurrency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-surface-soft px-4 py-3 text-body-sm text-muted">
                  如果卖出数量等于当前持仓，详情页会显示已清仓状态，交易历史会完整保留。
                </div>

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                  <Button type="submit" className="flex-1">
                    确认卖出
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowSellModal(false)}>
                    取消
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
