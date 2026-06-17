import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  formatAssetQuantity,
  formatAssetPrice,
  formatCurrency,
  formatPercent,
} from '../lib/utils';
import { api } from '../lib/api';
import { PortfolioData, PortfolioAsset } from '../types';
import {
  RefreshCw,
  Plus,
  AlertTriangle,
  Loader2,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const settlementCurrencies = [
  { value: 'CNY', label: '人民币 CNY' },
  { value: 'HKD', label: '港币 HKD' },
  { value: 'USD', label: '美元 USD' },
];

const assetFilters = [
  { value: 'all', label: '全部' },
  { value: 'a_stock', label: 'A股' },
  { value: 'hk_stock', label: '港股' },
  { value: 'us_stock', label: '美股' },
  { value: 'crypto', label: '加密货币' },
  { value: 'commodity', label: '大宗商品' },
  { value: 'otc_fund', label: '场外基金' },
] as const;

type AssetFilter = typeof assetFilters[number]['value'];

export const Dashboard: React.FC = () => {
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState<any[]>([]);
  const { user, updateUser } = useAuth();
  const [settlementCurrency, setSettlementCurrency] = useState(user?.preferred_currency || 'CNY');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');

  const fetchPortfolio = useCallback(async () => {
    try {
      const data = await api.get<PortfolioData>(`/prices/portfolio?currency=${settlementCurrency}`);
      setPortfolioData(data);
    } catch (error) {
      console.error('获取组合数据失败:', error);
    }
  }, [settlementCurrency]);

  const checkAlerts = useCallback(async () => {
    try {
      const data = await api.get<{ triggered_alerts: any[] }>('/prices/check-alerts');
      if (data.triggered_alerts.length > 0) {
        setTriggeredAlerts(prev => [...prev, ...data.triggered_alerts]);
        try {
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
        } catch {}
      }
    } catch (error) {
      console.error('检查价格提醒失败:', error);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPortfolio(), checkAlerts()]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchPortfolio();
    checkAlerts();

    const interval = setInterval(() => {
      fetchPortfolio();
      checkAlerts();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchPortfolio, checkAlerts]);

  useEffect(() => {
    setLoading(false);
  }, [portfolioData]);

  useEffect(() => {
    if (user?.preferred_currency && user.preferred_currency !== settlementCurrency) {
      setSettlementCurrency(user.preferred_currency);
    }
  }, [user?.preferred_currency]);

  const handleSettlementCurrencyChange = async (currency: string) => {
    setSettlementCurrency(currency);
    try {
      await updateUser({ preferred_currency: currency });
    } catch (error) {
      console.error('保存结算货币失败:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '400px' 
      }}>
        <Loader2 style={{ width: '32px', height: '32px', animation: 'spin 1s linear infinite', color: 'var(--color-coinbase-blue)' }} />
      </div>
    );
  }

  const summary = portfolioData?.summary;
  const summaries = portfolioData?.summary_by_currency && Object.keys(portfolioData.summary_by_currency).length > 0
    ? Object.values(portfolioData.summary_by_currency)
    : [];
  const portfolio = portfolioData?.portfolio || [];
  const filteredPortfolio = assetFilter === 'all'
    ? portfolio
    : portfolio.filter((asset) => asset.asset_type === assetFilter);

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '20px 16px 24px',
      backgroundColor: 'var(--color-canvas)'
    }}>
      {/* Header */}
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
          <p style={{ 
            fontSize: '16px', 
            color: 'var(--color-muted)' 
          }}>
            欢迎回来，{user?.username}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <label className="flex items-center justify-between gap-3 text-sm text-muted">
            结算货币
            <select
              value={settlementCurrency}
              onChange={(e) => handleSettlementCurrencyChange(e.target.value)}
              style={{
                height: '40px',
                minWidth: '136px',
                border: '1px solid var(--color-hairline)',
                borderRadius: '8px',
                padding: '0 12px',
                color: 'var(--color-ink)',
                backgroundColor: 'var(--color-canvas)',
                fontSize: '14px',
                outline: 'none',
              }}
            >
              {settlementCurrencies.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
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

      {/* Alerts */}
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
            <AlertTriangle style={{ width: '24px', height: '24px', color: 'var(--color-accent-yellow)', flexShrink: 0, marginTop: '2px' }} />
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
                  <div key={index} style={{ 
                    backgroundColor: 'var(--color-surface-soft)', 
                    padding: '16px', 
                    borderRadius: '12px' 
                  }}>
                    <p style={{ fontSize: '16px', color: 'var(--color-ink)' }}>
                      <span style={{ fontWeight: '600' }}>{alert.asset.name}</span>
                      {' '}价格已{alert.alert_type === 'above' ? '高于' : '低于'}目标价{' '}
                      {formatCurrency(alert.target_price, alert.asset.currency)}
                    </p>
                    <button
                      className="btn-text"
                      style={{ marginTop: '8px', fontSize: '14px' }}
                      onClick={() => setTriggeredAlerts(prev => prev.filter((_, i) => i !== index))}
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

      {/* Summary Stats */}
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
                  {formatCurrency(summary.total_profit, summary.currency)} · {formatPercent(summary.total_profit_percent)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '6px' }}>今日总收益</p>
                <p className="font-number" style={{ fontSize: '22px', fontWeight: 600, color: summary.daily_profit >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)' }}>
                  {formatCurrency(summary.daily_profit, summary.currency)}
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

      {/* Portfolio List */}
      <div>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: 'var(--color-ink)',
              lineHeight: '1.33'
            }}>
              持仓资产
            </h2>
            <div
              role="tablist"
              aria-label="持仓资产类型筛选"
              className="flex items-center gap-2 overflow-x-auto pb-1"
            >
              {assetFilters.map((filter) => {
                const isActive = assetFilter === filter.value;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setAssetFilter(filter.value)}
                    style={{
                      height: '36px',
                      padding: '0 14px',
                      borderRadius: '999px',
                      border: `1px solid ${isActive ? 'var(--color-coinbase-blue)' : 'var(--color-hairline)'}`,
                      backgroundColor: isActive ? 'var(--color-coinbase-blue)' : 'var(--color-surface-soft)',
                      color: isActive ? '#ffffff' : 'var(--color-ink)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                    }}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Link to="/assets" className="w-full md:w-auto">
            <button className="btn-primary w-full md:w-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Plus style={{ width: '16px', height: '16px' }} />
              添加资产
            </button>
          </Link>
        </div>

        {portfolio.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '48px 24px', 
            backgroundColor: 'var(--color-surface-soft)', 
            borderRadius: '24px' 
          }}>
            <Wallet style={{ 
              width: '48px', 
              height: '48px', 
              color: 'var(--color-muted)', 
              margin: '0 auto 16px' 
            }} />
            <p style={{ fontSize: '16px', color: 'var(--color-muted)', marginBottom: '24px' }}>
              还没有添加资产
            </p>
            <Link to="/assets">
              <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Plus style={{ width: '16px', height: '16px' }} />
                添加第一项资产
              </button>
            </Link>
          </div>
        ) : filteredPortfolio.length === 0 ? (
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
              可以切换到“全部”，或添加对应类型的资产。
            </p>
          </div>
        ) : (
          <div style={{ 
            backgroundColor: 'var(--color-canvas)', 
            border: '1px solid var(--color-hairline)', 
            borderRadius: '24px', 
            overflow: 'hidden' 
          }}>
            {filteredPortfolio.map((asset, index) => (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.05 }}
                className="asset-row"
                style={{ padding: '16px' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-canvas)'; }}
              >
                <AssetRow asset={asset} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface AssetRowProps {
  asset: PortfolioAsset;
}

const AssetRow: React.FC<AssetRowProps> = ({ asset }) => {
  const profitColor = asset.profit && asset.profit >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';
  const dailyProfitColor = asset.daily_profit && asset.daily_profit >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';

  return (
    <div className="flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
      {/* Asset Info */}
      <div className="flex-1 min-w-0">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="asset-icon">
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-ink)' }}>
              {asset.symbol.substring(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="truncate" style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-ink)', lineHeight: '1.25' }}>
              {asset.name}
            </h3>
            <p className="break-all" style={{ fontSize: '14px', color: 'var(--color-muted)' }}>{asset.symbol}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:flex md:flex-1">
        <div className="md:flex-1 md:text-center">
          <p style={{ fontSize: '14px', color: 'var(--color-muted)' }}>
            {formatAssetQuantity(asset.quantity, asset.asset_type)}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
            成本价：{formatAssetPrice(asset.buy_price, asset.currency, asset.asset_type)}
          </p>
        </div>

        <div className="md:flex-1 md:text-center">
          {asset.current_price !== null ? (
            <>
              <p style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: 'var(--color-ink)',
                lineHeight: '1.25'
              }} className="font-number">
                {formatAssetPrice(asset.current_price, asset.currency, asset.asset_type)}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                市值：{formatCurrency(asset.current_value || 0, asset.currency)}
              </p>
            </>
          ) : (
            <p style={{ fontSize: '14px', color: 'var(--color-muted)' }}>暂无价格</p>
          )}
        </div>

        <div className="md:flex-1 md:text-right">
          {asset.current_price !== null ? (
            <>
              <p style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: profitColor,
                lineHeight: '1.25'
              }} className="font-number">
                {formatCurrency(asset.profit || 0, asset.currency)}
              </p>
              <p style={{ 
                fontSize: '14px', 
                color: profitColor 
              }} className="font-number">
                {formatPercent(asset.profit_percent || 0)}
              </p>
              <p style={{ 
                fontSize: '12px', 
                color: dailyProfitColor 
              }} className="font-number">
                今日：{formatCurrency(asset.daily_profit || 0, asset.currency)}
              </p>
            </>
          ) : (
            <p style={{ fontSize: '14px', color: 'var(--color-muted)' }}>—</p>
          )}
        </div>
      </div>
    </div>
  );
};
