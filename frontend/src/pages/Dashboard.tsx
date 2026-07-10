import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { PortfolioHistoryChart } from '../components/PortfolioHistoryChart';
import {
  formatAssetPrice,
  formatAssetQuantity,
  formatCurrency,
  formatPercent,
  getAssetTypeLabel,
  formatQuantityValue,
} from '../lib/utils';
import { PortfolioData, PortfolioAsset, PortfolioHistoryData, TradeRecord } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useDialogA11y } from '../hooks/useDialogA11y';
import {
  RefreshCw,
  Plus,
  Loader2,
  Wallet,
  ArrowUpDown,
  Banknote,
  History,
  X,
  BellRing,
  ChevronDown,
} from 'lucide-react';

const settlementCurrencies = [
  { value: 'CNY', label: '人民币 CNY' },
  { value: 'HKD', label: '港币 HKD' },
  { value: 'USD', label: '美元 USD' },
];

const assetFilters = [
  { value: 'all', label: '全部' },
  { value: 'a_stock', label: 'A股' },
  { value: 'otc_fund', label: '场外基金' },
  { value: 'hk_stock', label: '港股' },
  { value: 'us_stock', label: '美股' },
  { value: 'crypto', label: '加密货币' },
  { value: 'commodity', label: '大宗商品' },
] as const;

const sortOptions = [
  { value: 'current_value', label: '按总金额大小' },
  { value: 'profit', label: '按总收益' },
  { value: 'daily_profit_percent', label: '按今日收益率' },
  { value: 'profit_percent', label: '按总收益率' },
  { value: 'asset_type', label: '按类型' },
] as const;

const pnlDisplayOptions = [
  { value: 'CNY', label: '人民币' },
  { value: 'USD', label: '美元' },
  { value: 'ORIGINAL', label: '原始币种' },
] as const;

type AssetFilter = typeof assetFilters[number]['value'];
type SortMode = typeof sortOptions[number]['value'];
type PnlDisplayMode = typeof pnlDisplayOptions[number]['value'];
type DashboardTab = 'positions' | 'history';

const notificationUsesBrowser = (method: string) => ['browser', 'popup', 'both'].includes(method);
const notificationUsesSound = (method: string) => ['sound', 'both'].includes(method);
const notificationUsesVibrate = (method: string) => method === 'vibrate';

const playAlertSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.45);
  } catch (error) {
    console.error('播放提醒声音失败:', error);
  }
};

const formatUpdatedAt = (value?: string) => {
  if (!value) return '--';
  const normalizedValue = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });
};

const convertPnlValue = (
  value: number | null | undefined,
  sourceCurrency: string | undefined,
  mode: PnlDisplayMode,
  rates?: Record<string, Record<string, number>>
) => {
  if (value === null || value === undefined || !sourceCurrency) {
    return null;
  }
  if (mode === 'ORIGINAL') {
    return { value, currency: sourceCurrency };
  }
  const rate = rates?.[sourceCurrency]?.[mode];
  if (rate === undefined || rate === null) {
    return { value, currency: sourceCurrency };
  }
  return {
    value: value * rate,
    currency: mode,
  };
};

const getPositionTypeLabel = (type: string) => {
  if (type === 'otc_fund') return '基金';
  return getAssetTypeLabel(type);
};

const getPositionTypeIconLabel = (type: string) => {
  const labels: Record<string, string> = {
    a_stock: 'A股',
    hk_stock: '港股',
    us_stock: '美股',
    crypto: '加密',
    otc_fund: '基金',
    commodity: '大宗',
  };
  return labels[type] || getPositionTypeLabel(type);
};

const getAlertActionLabel = (alertType: string) => {
  if (alertType === 'above') return '高于';
  if (alertType === 'below') return '低于';
  return '到达';
};

const normalizePortfolioHistoryData = (
  data: PortfolioHistoryData,
  fallbackCurrency: string
): PortfolioHistoryData => ({
  currency: data?.currency || fallbackCurrency,
  points: Array.isArray(data?.points) ? data.points : [],
});

export const Dashboard: React.FC = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryData | null>(null);
  const [portfolioHistoryError, setPortfolioHistoryError] = useState('');
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState<any[]>([]);
  const [settlementCurrency, setSettlementCurrency] = useState(user?.preferred_currency || 'CNY');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('current_value');
  const [pnlDisplayMode, setPnlDisplayMode] = useState<PnlDisplayMode>('ORIGINAL');
  const [activeTab, setActiveTab] = useState<DashboardTab>('positions');
  const [addingAsset, setAddingAsset] = useState<PortfolioAsset | null>(null);
  const [sellingAsset, setSellingAsset] = useState<PortfolioAsset | null>(null);
  const [addPositionSubmitting, setAddPositionSubmitting] = useState(false);
  const [sellSubmitting, setSellSubmitting] = useState(false);
  const addPositionDialogRef = useRef<HTMLDivElement>(null);
  const sellDialogRef = useRef<HTMLDivElement>(null);
  const [addPositionFormData, setAddPositionFormData] = useState({
    buy_price: '',
    quantity: '',
    amount: '',
  });
  const [sellFormData, setSellFormData] = useState({
    sell_price: '',
    quantity: '',
    amount: '',
  });

  const addPositionCurrency = addingAsset?.currency || 'CNY';
  const sellCurrency = sellingAsset?.currency || 'CNY';
  const preferencePrefix = user?.id ? `profit-cal:${user.id}:dashboard:` : 'profit-cal:dashboard:';

  const closeAddPositionModal = useCallback(() => {
    setAddingAsset(null);
  }, []);

  const closeSellModal = useCallback(() => {
    setSellingAsset(null);
  }, []);

  useDialogA11y(Boolean(addingAsset), closeAddPositionModal, addPositionDialogRef);
  useDialogA11y(Boolean(sellingAsset), closeSellModal, sellDialogRef);

  useEffect(() => {
    if (!user?.id) return;
    const savedSortMode = localStorage.getItem(`${preferencePrefix}sort-mode`) as SortMode | null;
    const savedPnlDisplayMode = localStorage.getItem(`${preferencePrefix}pnl-display-mode`) as PnlDisplayMode | null;
    const savedAssetFilter = localStorage.getItem(`${preferencePrefix}asset-filter`) as AssetFilter | null;
    if (savedSortMode && sortOptions.some((option) => option.value === savedSortMode)) {
      setSortMode(savedSortMode);
    }
    if (savedPnlDisplayMode && pnlDisplayOptions.some((option) => option.value === savedPnlDisplayMode)) {
      setPnlDisplayMode(savedPnlDisplayMode);
    }
    if (savedAssetFilter && assetFilters.some((option) => option.value === savedAssetFilter)) {
      setAssetFilter(savedAssetFilter);
    }
  }, [preferencePrefix, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(`${preferencePrefix}sort-mode`, sortMode);
    localStorage.setItem(`${preferencePrefix}pnl-display-mode`, pnlDisplayMode);
    localStorage.setItem(`${preferencePrefix}asset-filter`, assetFilter);
  }, [assetFilter, preferencePrefix, pnlDisplayMode, sortMode, user?.id]);

  const fetchHistory = useCallback(async () => {
    const data = await api.get<{ records: TradeRecord[] }>('/assets/history');
    setRecords(data.records);
  }, []);

  const fetchPortfolioHistory = useCallback(async () => {
    try {
      setPortfolioHistoryError('');
      const params = new URLSearchParams({ currency: settlementCurrency });
      const data = await api.get<PortfolioHistoryData>(`/portfolio/history?${params.toString()}`);
      setPortfolioHistory(normalizePortfolioHistoryData(data, settlementCurrency));
    } catch (error) {
      console.error('获取组合历史净值失败:', error);
      setPortfolioHistoryError(error instanceof Error ? error.message : '历史净值加载失败');
    }
  }, [settlementCurrency]);

  const fetchPortfolio = useCallback(async (options?: { refresh?: boolean; silent?: boolean }) => {
    const params = new URLSearchParams({
      currency: settlementCurrency,
    });
    if (options?.refresh) {
      params.set('refresh', '1');
    }

    if (options?.refresh && !options?.silent) {
      setRefreshing(true);
    }

    try {
      const data = await api.get<PortfolioData>(`/prices/portfolio?${params.toString()}`);
      setPortfolioData(data);
      return true;
    } catch (error) {
      console.error('获取组合数据失败:', error);
      if (options?.refresh && !options?.silent) {
        throw error;
      }
      return false;
    } finally {
      setLoading(false);
      if (options?.refresh && !options?.silent) {
        setRefreshing(false);
      }
    }
  }, [settlementCurrency]);

  const pushBrowserNotification = useCallback((alert: any) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title = `${alert.name} 提醒触发`;
    const body = `${alert.symbol} 当前价格 ${formatCurrency(alert.current_price, alert.currency)}，目标 ${formatCurrency(alert.target_price, alert.currency)}`;
    new Notification(title, { body, tag: alert.id });
  }, []);

  const checkAlerts = useCallback(async () => {
    try {
      const data = await api.get<{ triggered_alerts: any[] }>('/prices/check-alerts');
      if (data.triggered_alerts.length > 0) {
        setTriggeredAlerts((prev) => [...data.triggered_alerts, ...prev]);
        const shouldVibrate = data.triggered_alerts.some((alert) => notificationUsesVibrate(alert.notification_method));
        data.triggered_alerts.forEach((alert) => {
          if (notificationUsesBrowser(alert.notification_method)) {
            pushBrowserNotification(alert);
          }
          if (notificationUsesSound(alert.notification_method)) {
            playAlertSound();
          }
        });
        try {
          if (shouldVibrate && navigator.vibrate) {
            navigator.vibrate([220, 120, 220]);
          }
        } catch {}
      }
    } catch (error) {
      console.error('检查价格提醒失败:', error);
    }
  }, [pushBrowserNotification]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPortfolio(), fetchHistory(), fetchPortfolioHistory()]);
      if (!disposed) {
        fetchPortfolio({ refresh: true, silent: true });
        checkAlerts();
      }
    };

    loadData();
    const interval = setInterval(() => {
      fetchPortfolio({ refresh: true, silent: true });
      checkAlerts();
    }, 30000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [checkAlerts, fetchHistory, fetchPortfolio, fetchPortfolioHistory]);

  useEffect(() => {
    if (user?.preferred_currency && user.preferred_currency !== settlementCurrency) {
      setSettlementCurrency(user.preferred_currency);
    }
  }, [settlementCurrency, user?.preferred_currency]);

  const handleSettlementCurrencyChange = async (currency: string) => {
    setSettlementCurrency(currency);
    try {
      await updateUser({ preferred_currency: currency });
    } catch (error) {
      console.error('保存结算货币失败:', error);
    }
  };

  const handleMainTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const tabs: DashboardTab[] = ['positions', 'history'];
    const currentIndex = tabs.indexOf(activeTab);
    let nextTab: DashboardTab | null = null;

    if (event.key === 'ArrowRight') {
      nextTab = tabs[(currentIndex + 1) % tabs.length];
    } else if (event.key === 'ArrowLeft') {
      nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    } else if (event.key === 'Home') {
      nextTab = tabs[0];
    } else if (event.key === 'End') {
      nextTab = tabs[tabs.length - 1];
    }

    if (nextTab) {
      event.preventDefault();
      setActiveTab(nextTab);
      requestAnimationFrame(() => {
        document.getElementById(`dashboard-tab-${nextTab}`)?.focus();
      });
    }
  };

  const handleRefresh = async () => {
    try {
      const refreshed = await fetchPortfolio({ refresh: true });
      if (!refreshed) return;
      await api.post('/portfolio/history/snapshot', { currency: settlementCurrency });
      await Promise.all([
        fetchPortfolioHistory(),
        fetchHistory(),
        checkAlerts(),
      ]);
    } catch (error) {
      console.error('刷新组合数据失败:', error);
      setPortfolioHistoryError(error instanceof Error ? error.message : '历史净值快照生成失败');
    }
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sellSubmitting) return;
    if (!sellingAsset) return;
    setSellSubmitting(true);

    try {
      await api.post(`/assets/${sellingAsset.id}/sell`, {
        sell_price: parseFloat(sellFormData.sell_price),
        quantity: sellFormData.quantity ? parseFloat(sellFormData.quantity) : undefined,
        amount: sellFormData.amount ? parseFloat(sellFormData.amount) : undefined,
      });
      closeSellModal();
      setSellFormData({ sell_price: '', quantity: '', amount: '' });
      setActiveTab('history');
      await Promise.all([
        fetchPortfolio({ refresh: true }),
        fetchHistory(),
      ]);
    } catch (error: any) {
      alert(error.message || '卖出失败');
    } finally {
      setSellSubmitting(false);
    }
  };

  const handleAddPositionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addPositionSubmitting) return;
    if (!addingAsset) return;
    setAddPositionSubmitting(true);

    try {
      await api.post(`/assets/${addingAsset.id}/add-position`, {
        buy_price: parseFloat(addPositionFormData.buy_price),
        quantity: addPositionFormData.quantity ? parseFloat(addPositionFormData.quantity) : undefined,
        amount: addPositionFormData.amount ? parseFloat(addPositionFormData.amount) : undefined,
      });
      closeAddPositionModal();
      setAddPositionFormData({ buy_price: '', quantity: '', amount: '' });
      setActiveTab('history');
      await Promise.all([
        fetchPortfolio({ refresh: true }),
        fetchHistory(),
      ]);
    } catch (error: any) {
      alert(error.message || '加仓失败');
    } finally {
      setAddPositionSubmitting(false);
    }
  };

  const summary = portfolioData?.summary;
  const summaries = portfolioData?.summary_by_currency && Object.keys(portfolioData.summary_by_currency).length > 0
    ? Object.values(portfolioData.summary_by_currency)
    : [];

  const filteredPortfolio = useMemo(() => {
    const source = portfolioData?.portfolio || [];
    const filtered = assetFilter === 'all'
      ? source
      : source.filter((asset) => asset.asset_type === assetFilter);

    const clone = [...filtered];
    clone.sort((a, b) => {
      if (sortMode === 'asset_type') {
        return (a.type_sort_order ?? 999) - (b.type_sort_order ?? 999);
      }

      const left = sortMode === 'current_value'
        ? a.sort_current_value_base ?? Number.NEGATIVE_INFINITY
        : sortMode === 'profit'
          ? a.sort_profit_base ?? Number.NEGATIVE_INFINITY
          : sortMode === 'daily_profit_percent'
            ? a.daily_profit_percent ?? Number.NEGATIVE_INFINITY
            : a.profit_percent ?? Number.NEGATIVE_INFINITY;

      const right = sortMode === 'current_value'
        ? b.sort_current_value_base ?? Number.NEGATIVE_INFINITY
        : sortMode === 'profit'
          ? b.sort_profit_base ?? Number.NEGATIVE_INFINITY
          : sortMode === 'daily_profit_percent'
            ? b.daily_profit_percent ?? Number.NEGATIVE_INFINITY
            : b.profit_percent ?? Number.NEGATIVE_INFINITY;

      return right - left;
    });
    return clone;
  }, [assetFilter, portfolioData?.portfolio, sortMode]);

  const displayedSummary = useMemo(() => {
    if (!summary) return null;
    if (pnlDisplayMode === 'ORIGINAL' || !portfolioData?.summary_by_currency) {
      return {
        totalProfit: summary.total_profit,
        dailyProfit: summary.daily_profit,
        currency: summary.currency,
      };
    }

    let totalProfit = 0;
    let dailyProfit = 0;
    Object.values(portfolioData.summary_by_currency).forEach((item) => {
      const rate = portfolioData.pnl_exchange_rates?.[item.currency]?.[pnlDisplayMode] ?? 1;
      totalProfit += item.total_profit * rate;
      dailyProfit += item.daily_profit * rate;
    });

    return {
      totalProfit,
      dailyProfit,
      currency: pnlDisplayMode,
    };
  }, [pnlDisplayMode, portfolioData?.pnl_exchange_rates, portfolioData?.summary_by_currency, summary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-coinbase-blue" />
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '1260px',
      margin: '0 auto',
      padding: '20px 16px 24px',
      backgroundColor: 'var(--color-canvas)'
    }}>
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{
            fontSize: 'clamp(30px, 8vw, 36px)',
            fontWeight: '600',
            lineHeight: '1.11',
            letterSpacing: 0,
            color: 'var(--color-ink)',
            marginBottom: '8px'
          }}>
            资产总览
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--color-muted)' }}>
            欢迎回来，{user?.username}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <label htmlFor="dashboard-settlement-currency" className="flex items-center justify-between gap-3 text-sm font-medium text-muted">
            <span>结算货币</span>
            <div className="relative min-w-[150px]">
              <Select
                id="dashboard-settlement-currency"
                value={settlementCurrency}
                onChange={(e) => handleSettlementCurrencyChange(e.target.value)}
                className="h-10 cursor-pointer appearance-none rounded-xl bg-canvas py-0 pl-3 pr-9 text-sm font-semibold shadow-none"
              >
                {settlementCurrencies.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>
          </label>
          <div className="text-sm text-muted text-left sm:text-right">
            <div>更新于 {formatUpdatedAt(portfolioData?.updated_at)}</div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <RefreshCw
              style={{
                width: '16px',
                height: '16px',
                animation: refreshing ? 'spin 1s linear infinite' : 'none'
              }}
            />
            刷新
          </button>
        </div>
      </div>

      {triggeredAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-light"
          style={{
            marginBottom: '32px',
            borderLeft: '4px solid var(--color-accent-yellow)'
          }}
        >
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <BellRing style={{ width: '24px', height: '24px', color: 'var(--color-accent-yellow)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: 'var(--color-ink)',
                marginBottom: '16px'
              }}>
                价格提醒已触发
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {triggeredAlerts.map((alert, index) => (
                  <div
                    key={`${alert.id}-${index}`}
                    style={{
                      backgroundColor: 'var(--color-surface-soft)',
                      padding: '16px',
                      borderRadius: '12px'
                    }}
                  >
                    <p style={{ fontSize: '16px', color: 'var(--color-ink)' }}>
                      <span style={{ fontWeight: '600' }}>{alert.name}</span>
                      {' '}({alert.symbol}) 价格已{getAlertActionLabel(alert.alert_type)}目标价{' '}
                      {formatCurrency(alert.target_price, alert.currency)}
                    </p>
                    <p style={{ fontSize: '14px', color: 'var(--color-muted)', marginTop: '6px' }}>
                      当前价格：{formatCurrency(alert.current_price, alert.currency)} · {getAssetTypeLabel(alert.asset_type)}
                    </p>
                    <button
                      className="btn-text"
                      style={{ marginTop: '8px', fontSize: '14px' }}
                      onClick={() => setTriggeredAlerts((prev) => prev.filter((_, i) => i !== index))}
                    >
                      知道了
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '32px'
        }}>
          <motion.div
            key={`total-${summary.currency}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="card-light"
            style={{
              border: '1px solid var(--color-coinbase-blue)',
              padding: '24px',
              gridColumn: '1 / -1',
              backgroundColor: 'color-mix(in srgb, var(--color-coinbase-blue) 8%, var(--color-canvas))',
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-coinbase-blue)' }}>
                <Wallet style={{ width: '18px', height: '18px' }} />
                <span style={{ fontSize: '15px', fontWeight: 600 }}>总账户情况</span>
              </div>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                按 {summary.currency} 折算
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '18px' }}>
              <div>
                <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '6px' }}>总投入</p>
                <p className="font-number" style={{ fontSize: '22px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  {formatCurrency(summary.total_investment, summary.currency)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '6px' }}>总市值</p>
                <p className="font-number" style={{ fontSize: '22px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  {formatCurrency(summary.total_current_value, summary.currency)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '6px' }}>总收益</p>
                <p className="font-number" style={{ fontSize: '22px', fontWeight: 600, color: summary.total_profit >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)' }}>
                  {displayedSummary ? formatCurrency(displayedSummary.totalProfit, displayedSummary.currency) : formatCurrency(summary.total_profit, summary.currency)} · {formatPercent(summary.total_profit_percent)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '6px' }}>今日总收益</p>
                <p className="font-number" style={{ fontSize: '22px', fontWeight: 600, color: summary.daily_profit >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)' }}>
                  {displayedSummary ? formatCurrency(displayedSummary.dailyProfit, displayedSummary.currency) : formatCurrency(summary.daily_profit, summary.currency)}
                </p>
              </div>
            </div>
          </motion.div>

          {summaries.map((item, index) => (
            <motion.div
              key={item.currency}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 + index * 0.05 }}
              className="card-light"
              style={{ border: '1px solid var(--color-hairline)', padding: '24px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-muted)' }}>
                  <Wallet style={{ width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '14px' }}>币种明细</span>
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>{item.currency}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '4px' }}>投入金额</p>
                  <p className="font-number" style={{ fontSize: '16px', color: 'var(--color-ink)' }}>
                    {formatCurrency(item.total_investment, item.currency)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '4px' }}>当前市值</p>
                  <p className="font-number" style={{ fontSize: '16px', color: 'var(--color-ink)' }}>
                    {formatCurrency(item.total_current_value, item.currency)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '4px' }}>累计收益</p>
                  <p className="font-number" style={{ fontSize: '16px', color: item.total_profit >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)' }}>
                    {formatCurrency(item.total_profit, item.currency)} · {formatPercent(item.total_profit_percent)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '4px' }}>今日收益</p>
                  <p className="font-number" style={{ fontSize: '16px', color: item.daily_profit >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)' }}>
                    {formatCurrency(item.daily_profit, item.currency)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {(portfolioHistory || portfolioHistoryError) && (
        <PortfolioHistoryChart
          currency={portfolioHistory?.currency || settlementCurrency}
          points={portfolioHistory?.points || []}
          error={portfolioHistoryError}
          onRetry={fetchPortfolioHistory}
        />
      )}

      <div className="card-light" style={{ padding: '24px' }}>
        <div className="flex flex-col gap-4 border-b border-hairline pb-5 mb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-4">
              <div role="tablist" aria-label="资产视图" className="flex items-center gap-2 border-b border-hairline overflow-x-auto">
                <button
                  id="dashboard-tab-positions"
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'positions'}
                  aria-controls="dashboard-panel-positions"
                  tabIndex={activeTab === 'positions' ? 0 : -1}
                  onKeyDown={handleMainTabKeyDown}
                  onClick={() => setActiveTab('positions')}
                  className={`px-4 py-3 text-nav-link border-b-2 transition-colors ${
                    activeTab === 'positions'
                      ? 'border-coinbase-blue text-ink'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  持仓资产
                </button>
                <button
                  id="dashboard-tab-history"
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'history'}
                  aria-controls="dashboard-panel-history"
                  tabIndex={activeTab === 'history' ? 0 : -1}
                  onKeyDown={handleMainTabKeyDown}
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-3 text-nav-link border-b-2 transition-colors ${
                    activeTab === 'history'
                      ? 'border-coinbase-blue text-ink'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  历史记录
                </button>
              </div>
              {activeTab === 'positions' && (
                <div
                  aria-label="持仓资产类型筛选"
                  className="flex items-center gap-2 overflow-x-auto pb-1"
                >
                  {assetFilters.map((filter) => {
                    const isActive = assetFilter === filter.value;
                    return (
                      <button
                        key={filter.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setAssetFilter(filter.value)}
                        style={{
                          height: '34px',
                          padding: '0 14px',
                          minWidth: '48px',
                          borderRadius: '999px',
                          border: `1px solid ${isActive ? 'var(--color-coinbase-blue)' : 'var(--color-hairline)'}`,
                          backgroundColor: isActive ? 'var(--color-coinbase-blue)' : 'var(--color-canvas)',
                          color: isActive ? '#ffffff' : 'var(--color-ink)',
                          fontSize: '13px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                        }}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {activeTab === 'positions' && (
              <div className="flex w-full flex-col gap-3 xl:w-[620px]">
                <Link to="/assets" className="w-full sm:w-auto xl:self-end">
                  <button className="btn-primary w-full xl:w-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', height: '38px', padding: '0 16px', fontSize: '14px' }}>
                    <Plus style={{ width: '14px', height: '14px' }} />
                    添加资产
                  </button>
                </Link>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DashboardSelect
                    label="排序方式"
                    icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                    value={sortMode}
                    options={sortOptions}
                    onChange={setSortMode}
                  />
                  <DashboardSelect
                    label="盈亏显示"
                    icon={<Wallet className="h-3.5 w-3.5" />}
                    value={pnlDisplayMode}
                    options={pnlDisplayOptions}
                    onChange={setPnlDisplayMode}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'positions' ? (
          <div id="dashboard-panel-positions" role="tabpanel" aria-labelledby="dashboard-tab-positions">
            {filteredPortfolio.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '44px 24px',
                backgroundColor: 'var(--color-surface-soft)',
                border: '1px solid var(--color-hairline)',
                borderRadius: '24px'
              }}>
                <Wallet style={{
                  width: '44px',
                  height: '44px',
                  color: 'var(--color-muted)',
                  margin: '0 auto 16px'
                }} />
                <p style={{ fontSize: '16px', color: 'var(--color-ink)', fontWeight: 600, marginBottom: '8px' }}>
                  当前筛选下没有持仓
                </p>
                <p style={{ fontSize: '14px', color: 'var(--color-muted)' }}>
                  可以切换筛选、调整排序，或继续添加资产。
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPortfolio.map((asset, index) => (
                  <motion.div
                    key={asset.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                  >
                    <PositionCard
                      asset={asset}
                      pnlDisplayMode={pnlDisplayMode}
                      pnlExchangeRates={portfolioData?.pnl_exchange_rates}
                      onAddPosition={() => {
                        setAddingAsset(asset);
                        setAddPositionFormData({ buy_price: '', quantity: '', amount: '' });
                      }}
                      onSell={() => {
                        setSellingAsset(asset);
                        setSellFormData({ sell_price: '', quantity: '', amount: '' });
                      }}
                      onViewDetail={() => navigate(`/assets/${asset.id}/detail`)}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div id="dashboard-panel-history" role="tabpanel" aria-labelledby="dashboard-tab-history">
            {records.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '44px 24px',
                backgroundColor: 'var(--color-surface-soft)',
                border: '1px solid var(--color-hairline)',
                borderRadius: '24px'
              }}>
                <History style={{
                  width: '44px',
                  height: '44px',
                  color: 'var(--color-muted)',
                  margin: '0 auto 16px'
                }} />
                <p style={{ fontSize: '16px', color: 'var(--color-ink)', fontWeight: 600, marginBottom: '8px' }}>
                  还没有交易记录
                </p>
                <p style={{ fontSize: '14px', color: 'var(--color-muted)' }}>
                  买入、卖出和清仓都会在这里保留历史。
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="rounded-2xl border border-hairline bg-canvas px-4 py-4 sm:px-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-title-sm font-semibold text-ink">{record.asset_name}</span>
                          <span className="text-caption px-2 py-0.5 bg-surface-soft text-muted rounded-full">
                            {record.action === 'buy' ? '买入' : '卖出'}
                          </span>
                          <span className="text-caption px-2 py-0.5 bg-surface-soft text-muted rounded-full">
                            {getAssetTypeLabel(record.asset_type)}
                          </span>
                        </div>
                        <p className="text-body-sm text-muted break-all">
                          {record.symbol} · {new Date(record.created_at).toLocaleString('zh-CN', { hour12: false })}
                        </p>
                        <p className="text-body-sm text-muted mt-2">
                          {formatAssetQuantity(record.quantity, record.asset_type)} · 成交价 {formatAssetPrice(record.price, record.currency, record.asset_type)} · 金额 {formatCurrency(record.amount, record.currency)}
                        </p>
                      </div>
                      {record.action === 'sell' && (
                        <div className="text-left sm:text-right">
                          <p className={`font-number text-title-sm ${(record.realized_profit || 0) >= 0 ? 'text-semantic-up' : 'text-semantic-down'}`}>
                            {formatCurrency(record.realized_profit || 0, record.currency)}
                          </p>
                          <p className={`font-number text-body-sm ${(record.realized_profit || 0) >= 0 ? 'text-semantic-up' : 'text-semantic-down'}`}>
                            {record.realized_profit_percent !== null ? `${record.realized_profit_percent >= 0 ? '+' : ''}${record.realized_profit_percent.toFixed(2)}%` : '--'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {addingAsset && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeAddPositionModal}
            />
            <motion.div
              ref={addPositionDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-add-position-title"
              tabIndex={-1}
              initial={{ opacity: 0, y: '100%', scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: '100%', scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full sm:max-w-lg bg-canvas rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-hairline">
                <div>
                  <h2 id="dashboard-add-position-title" className="text-title-md font-semibold text-ink">加仓资产</h2>
                  <p className="text-body-sm text-muted mt-1">
                    {addingAsset.name} · 当前持有 {formatAssetQuantity(addingAsset.quantity, addingAsset.asset_type)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={closeAddPositionModal}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <form onSubmit={handleAddPositionSubmit} className="px-6 py-6 space-y-5">
                <div>
                  <label htmlFor="dashboard-add-buy-price" className="block text-caption font-medium text-ink mb-2">加仓价</label>
                  <Input
                    id="dashboard-add-buy-price"
                    type="number"
                    step="0.001"
                    value={addPositionFormData.buy_price}
                    onChange={(e) => setAddPositionFormData({ ...addPositionFormData, buy_price: e.target.value })}
                    placeholder="加仓价格"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="dashboard-add-quantity" className="block text-caption font-medium text-ink mb-2">数量</label>
                    <Input
                      id="dashboard-add-quantity"
                      type="number"
                      step="0.000001"
                      value={addPositionFormData.quantity}
                      onChange={(e) => setAddPositionFormData({ ...addPositionFormData, quantity: e.target.value, amount: '' })}
                      placeholder="数量"
                    />
                  </div>
                  <div>
                    <label htmlFor="dashboard-add-amount" className="block text-caption font-medium text-ink mb-2">或金额</label>
                    <div className="relative">
                      <Input
                        id="dashboard-add-amount"
                        type="number"
                        step="0.01"
                        value={addPositionFormData.amount}
                        onChange={(e) => setAddPositionFormData({ ...addPositionFormData, amount: e.target.value, quantity: '' })}
                        placeholder="加仓金额"
                        className="pr-20"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body-sm font-medium text-muted">
                        {addPositionCurrency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-surface-soft px-4 py-3 text-body-sm text-muted">
                  填写数量或金额其中之一即可，提交后会按加权平均法刷新当前持仓成本价。
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <Button type="submit" disabled={addPositionSubmitting} className="flex-1">
                    {addPositionSubmitting ? '提交中...' : '确认加仓'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeAddPositionModal}>
                    取消
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {sellingAsset && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeSellModal}
            />
            <motion.div
              ref={sellDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-sell-title"
              tabIndex={-1}
              initial={{ opacity: 0, y: '100%', scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: '100%', scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full sm:max-w-lg bg-canvas rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-hairline">
                <div>
                  <h2 id="dashboard-sell-title" className="text-title-md font-semibold text-ink">卖出资产</h2>
                  <p className="text-body-sm text-muted mt-1">
                    {sellingAsset.name} · 当前持有 {formatAssetQuantity(sellingAsset.quantity, sellingAsset.asset_type)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={closeSellModal}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <form onSubmit={handleSellSubmit} className="px-6 py-6 space-y-5">
                <div>
                  <label htmlFor="dashboard-sell-price" className="block text-caption font-medium text-ink mb-2">卖出价</label>
                  <Input
                    id="dashboard-sell-price"
                    type="number"
                    step="0.001"
                    value={sellFormData.sell_price}
                    onChange={(e) => setSellFormData({ ...sellFormData, sell_price: e.target.value })}
                    placeholder="卖出价格"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="dashboard-sell-quantity" className="block text-caption font-medium text-ink">数量</label>
                      <button
                        type="button"
                        className="text-caption font-medium text-coinbase-blue"
                        onClick={() => setSellFormData({
                          ...sellFormData,
                          quantity: formatQuantityValue(sellingAsset.quantity),
                          amount: '',
                        })}
                      >
                        全部卖出
                      </button>
                    </div>
                    <Input
                      id="dashboard-sell-quantity"
                      type="number"
                      step="0.000001"
                      value={sellFormData.quantity}
                      onChange={(e) => setSellFormData({ ...sellFormData, quantity: e.target.value, amount: '' })}
                      placeholder="数量"
                    />
                  </div>
                  <div>
                    <label htmlFor="dashboard-sell-amount" className="block text-caption font-medium text-ink mb-2">或金额</label>
                    <div className="relative">
                      <Input
                        id="dashboard-sell-amount"
                        type="number"
                        step="0.01"
                        value={sellFormData.amount}
                        onChange={(e) => setSellFormData({ ...sellFormData, amount: e.target.value, quantity: '' })}
                        placeholder="卖出金额"
                        className="pr-20"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body-sm font-medium text-muted">
                        {sellCurrency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-surface-soft px-4 py-3 text-body-sm text-muted">
                  如果卖出数量等于当前持仓，主页会直接移除该类目，但历史记录会完整保留。
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <Button type="submit" disabled={sellSubmitting} className="flex-1">
                    {sellSubmitting ? '提交中...' : '确认卖出'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeSellModal}>
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

type DashboardSelectOption<T extends string> = {
  value: T;
  label: string;
};

function DashboardSelect<T extends string>({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: T;
  options: readonly DashboardSelectOption<T>[];
  onChange: (value: T) => void;
}) {
  const selectId = useId();

  return (
    <label htmlFor={selectId} className="group flex items-center justify-between gap-2 rounded-2xl border border-hairline bg-surface-soft px-3 py-2 transition-colors">
      <span className="flex shrink-0 items-center gap-2 text-[13px] font-medium text-muted">
        {icon}
        {label}
      </span>
      <div className="relative min-w-0 flex-1">
        <Select
          id={selectId}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="h-9 cursor-pointer appearance-none rounded-xl bg-canvas py-0 pl-3 pr-8 text-[13px] font-semibold shadow-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted transition-colors group-focus-within:text-coinbase-blue" />
      </div>
    </label>
  );
}

const PositionCard: React.FC<{
  asset: PortfolioAsset;
  pnlDisplayMode: PnlDisplayMode;
  pnlExchangeRates?: Record<string, Record<string, number>>;
  onAddPosition: () => void;
  onSell: () => void;
  onViewDetail: () => void;
}> = ({ asset, pnlDisplayMode, pnlExchangeRates, onAddPosition, onSell, onViewDetail }) => {
  const displayedProfit = convertPnlValue(asset.profit, asset.currency, pnlDisplayMode, pnlExchangeRates);
  const displayedDailyProfit = convertPnlValue(asset.daily_profit, asset.currency, pnlDisplayMode, pnlExchangeRates);
  const totalProfitColor = ((displayedProfit?.value ?? 0) >= 0) ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';
  const dailyProfitColor = ((displayedDailyProfit?.value ?? 0) >= 0) ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';

  return (
    <div className="rounded-2xl border border-hairline bg-canvas px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-center xl:gap-4 2xl:flex-nowrap">
        <div className="flex min-w-0 items-center gap-4 xl:w-[220px] xl:flex-none">
          <div className="h-14 w-14 rounded-full bg-surface-soft flex items-center justify-center shrink-0">
            <span className="text-[14px] font-semibold text-ink">
              {getPositionTypeIconLabel(asset.asset_type)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-title-sm font-semibold text-ink break-words leading-snug">{asset.name}</h3>
            <p className="text-body-sm text-muted break-all">{asset.symbol}</p>
            {asset.error && <p className="text-body-sm text-semantic-down mt-1">{asset.error}</p>}
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 xl:min-w-[340px] xl:grid-cols-[0.9fr,1fr,1fr,1.25fr]">
          <PositionMetric
            label="仓位"
            value={formatAssetQuantity(asset.quantity, asset.asset_type)}
          />
          <PositionMetric
            label="成本价"
            value={formatAssetPrice(asset.buy_price, asset.currency, asset.asset_type)}
          />
          <PositionMetric
            label="现价"
            value={asset.current_price !== null ? formatAssetPrice(asset.current_price, asset.currency, asset.asset_type) : '--'}
            strong
          />
          <PositionMetric
            label="市值"
            value={asset.current_value !== null ? formatCurrency(asset.current_value, asset.currency) : '--'}
          />
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[210px] xl:flex-none">
          <div className="min-w-0 text-left sm:text-center xl:text-right">
            <p className="text-body-sm text-muted">总收益</p>
            <p className="font-number text-title-md mt-1" style={{ color: totalProfitColor }}>
              {displayedProfit
                ? formatCurrency(displayedProfit.value, displayedProfit.currency)
                : '--'}
            </p>
            <p className="font-number text-body-sm mt-1" style={{ color: totalProfitColor }}>
              {asset.profit_percent !== null && asset.profit_percent !== undefined ? formatPercent(asset.profit_percent) : '--'}
            </p>
          </div>

          <div className="min-w-0 text-left sm:text-center xl:text-right">
            <p className="text-body-sm text-muted">今日收益</p>
            <p className="font-number text-title-md mt-1" style={{ color: dailyProfitColor }}>
              {displayedDailyProfit
                ? formatCurrency(displayedDailyProfit.value, displayedDailyProfit.currency)
                : '--'}
            </p>
            <p className="font-number text-body-sm mt-1" style={{ color: dailyProfitColor }}>
              {asset.daily_profit_percent !== null && asset.daily_profit_percent !== undefined
                ? formatPercent(asset.daily_profit_percent)
                : '--'}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 gap-2 xl:w-[280px] xl:flex-none">
          <Button variant="ghost" onClick={onViewDetail} className="min-w-0 flex-1 px-3">
            详情
          </Button>
          <Button variant="secondary" onClick={onAddPosition} className="min-w-0 flex-1 px-3">
            <Plus className="mr-1 h-4 w-4 shrink-0" />
            加仓
          </Button>
          <Button variant="outline" onClick={onSell} className="min-w-0 flex-1 px-3">
            <Banknote className="mr-1 h-4 w-4 shrink-0" />
            卖出
          </Button>
        </div>
      </div>
    </div>
  );
};

const PositionMetric: React.FC<{
  label: string;
  value: string;
  strong?: boolean;
}> = ({ label, value, strong = false }) => (
  <div className="min-w-0">
    <p className="text-body-sm text-muted">{label}</p>
    <p
      className={`mt-1 whitespace-nowrap ${strong ? 'font-number text-title-sm font-semibold text-ink' : 'text-body-sm text-ink'}`}
      title={value}
    >
      {value}
    </p>
  </div>
);
