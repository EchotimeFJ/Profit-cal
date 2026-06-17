import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Loader2,
  X,
  Wallet,
  ChevronRight,
  Banknote,
  History,
} from 'lucide-react';
import { api } from '../lib/api';
import { Asset, TradeRecord } from '../types';
import { formatAssetPrice, formatAssetQuantity, formatCurrency, formatQuantityValue, getAssetTypeLabel } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  currency: string;
}

const assetTypeCurrency: Record<string, string> = {
  a_stock: 'CNY',
  hk_stock: 'HKD',
  us_stock: 'USD',
  crypto: 'USD',
  commodity: 'USD',
  otc_fund: 'CNY',
};

const getCurrencyForAssetType = (assetType: string) => assetTypeCurrency[assetType] || 'USD';

const CurrencyAmountInput: React.FC<{
  currency: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}> = ({ currency, value, placeholder, onChange }) => {
  return (
    <div className="relative">
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-20"
      />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body-sm font-medium text-muted">
        {currency}
      </span>
    </div>
  );
};

export const Assets: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [sellingAsset, setSellingAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    asset_type: 'us_stock',
    buy_price: '',
    quantity: '',
    amount: '',
    currency: 'USD',
  });
  const [sellFormData, setSellFormData] = useState({
    sell_price: '',
    quantity: '',
    amount: '',
  });
  const sellCurrency = sellingAsset?.currency || formData.currency;

  const fetchAssets = async () => {
    try {
      const data = await api.get<{ assets: Asset[] }>('/assets');
      setAssets(data.assets);
    } catch (error) {
      console.error('获取资产失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await api.get<{ records: TradeRecord[] }>('/assets/history');
      setRecords(data.records);
    } catch (error) {
      console.error('获取交易记录失败:', error);
    }
  };

  useEffect(() => {
    fetchAssets();
    fetchHistory();
  }, []);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setFormData(prev => ({ ...prev, symbol: query, name: '' }));

    if (query.length > 0) {
      setSearching(true);
      try {
        const data = await api.get<{ results: SearchResult[] }>(`/prices/search?q=${encodeURIComponent(query)}`);
        setSearchResults(data.results);
      } catch (error) {
        console.error('搜索资产失败:', error);
      } finally {
        setSearching(false);
      }
    } else {
      setSearchResults([]);
    }
  };

  const selectSearchResult = (result: SearchResult) => {
    setFormData({
      ...formData,
      name: result.name,
      symbol: result.symbol,
      asset_type: result.type,
      currency: getCurrencyForAssetType(result.type),
    });
    setSearchQuery(`${result.name}（${result.symbol}）`);
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const data = {
        ...formData,
        buy_price: parseFloat(formData.buy_price),
        quantity: formData.quantity ? parseFloat(formData.quantity) : undefined,
        amount: formData.amount ? parseFloat(formData.amount) : undefined,
      };

      if (editingAsset) {
        await api.put(`/assets/${editingAsset.id}`, data);
      } else {
        await api.post('/assets', data);
      }

      setShowModal(false);
      resetForm();
      fetchAssets();
      fetchHistory();
    } catch (error: any) {
      alert(error.message || '操作失败');
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      symbol: asset.symbol,
      asset_type: asset.asset_type,
      buy_price: asset.buy_price.toString(),
      quantity: formatQuantityValue(asset.quantity),
      amount: '',
      currency: asset.currency,
    });
    setShowModal(true);
  };

  const handleDelete = async (assetId: number) => {
    try {
      await api.delete(`/assets/${assetId}`);
      fetchAssets();
    } catch (error) {
      console.error('删除资产失败:', error);
    }
  };

  const handleSell = (asset: Asset) => {
    setSellingAsset(asset);
    setSellFormData({
      sell_price: '',
      quantity: '',
      amount: '',
    });
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sellingAsset) return;

    try {
      await api.post(`/assets/${sellingAsset.id}/sell`, {
        sell_price: parseFloat(sellFormData.sell_price),
        quantity: sellFormData.quantity ? parseFloat(sellFormData.quantity) : undefined,
        amount: sellFormData.amount ? parseFloat(sellFormData.amount) : undefined,
      });

      setSellingAsset(null);
      setSellFormData({ sell_price: '', quantity: '', amount: '' });
      fetchAssets();
      fetchHistory();
      setActiveTab('history');
    } catch (error: any) {
      alert(error.message || '卖出失败');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      symbol: '',
      asset_type: 'us_stock',
      buy_price: '',
      quantity: '',
      amount: '',
      currency: 'USD',
    });
    setEditingAsset(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-coinbase-blue" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="text-title-lg font-bold text-ink mb-1">资产</h1>
          <p className="text-body text-muted">管理您的投资组合</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="w-full sm:w-auto">
          <Plus className="w-5 h-5 mr-2" />
          添加资产
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-6 border-b border-hairline overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('positions')}
          className={`px-4 py-3 text-nav-link border-b-2 transition-colors ${
            activeTab === 'positions'
              ? 'border-coinbase-blue text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          当前持仓
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-3 text-nav-link border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-coinbase-blue text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          交易记录
        </button>
      </div>

      {activeTab === 'positions' ? (
      <div className="space-y-4">
        {assets.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <div className="w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet className="w-8 h-8 text-muted" />
              </div>
              <h3 className="text-title-md font-semibold text-ink mb-2">还没有添加任何资产</h3>
              <p className="text-body text-muted mb-6">开始添加您的第一个投资资产</p>
              <Button onClick={() => setShowModal(true)}>
                <Plus className="w-5 h-5 mr-2" />
                添加资产
              </Button>
            </CardContent>
          </Card>
        ) : (
          assets.map((asset, index) => (
            <motion.div
              key={asset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card>
                <CardContent className="py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start sm:items-center flex-1 min-w-0">
                      <div className="w-12 h-12 bg-surface-soft rounded-full flex items-center justify-center mr-3 sm:mr-4 shrink-0">
                        <span className="text-title-sm font-semibold text-ink">
                          {asset.symbol.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="text-title-sm font-semibold text-ink break-words">{asset.name}</h3>
                          <span className="text-caption px-2 py-0.5 bg-surface-soft text-muted rounded-full">
                            {getAssetTypeLabel(asset.asset_type)}
                          </span>
                        </div>
                        <p className="text-body-sm text-muted break-all">{asset.symbol}</p>
                        <p className="text-body-sm text-muted mt-1">
                          持有 {formatAssetQuantity(asset.quantity, asset.asset_type)} · 买入价 {formatAssetPrice(asset.buy_price, asset.currency, asset.asset_type)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <Button variant="outline" size="sm" onClick={() => handleSell(asset)} className="flex-1 sm:flex-none">
                        <Banknote className="w-4 h-4 mr-1" />
                        卖出/清仓
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(asset)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(asset.id)}>
                        <Trash2 className="w-4 h-4 text-semantic-down" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
      ) : (
        <div className="space-y-4">
          {records.length === 0 ? (
            <Card>
              <CardContent className="text-center py-16">
                <div className="w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="w-8 h-8 text-muted" />
                </div>
                <h3 className="text-title-md font-semibold text-ink mb-2">还没有交易记录</h3>
                <p className="text-body text-muted">添加资产会记录买入，卖出或清仓会记录已实现盈亏</p>
              </CardContent>
            </Card>
          ) : (
            records.map((record) => (
              <Card key={record.id}>
                <CardContent className="py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start sm:items-center flex-1 min-w-0">
                      <div className="w-12 h-12 bg-surface-soft rounded-full flex items-center justify-center mr-3 sm:mr-4 shrink-0">
                        {record.action === 'buy' ? (
                          <Plus className="w-5 h-5 text-semantic-up" />
                        ) : (
                          <Banknote className="w-5 h-5 text-coinbase-blue" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="text-title-sm font-semibold text-ink break-words">{record.asset_name}</h3>
                          <span className="text-caption px-2 py-0.5 bg-surface-soft text-muted rounded-full">
                            {record.action === 'buy' ? '买入' : '卖出'}
                          </span>
                        </div>
                        <p className="text-body-sm text-muted break-all">
                          {record.symbol} · {getAssetTypeLabel(record.asset_type)} · {new Date(record.created_at).toLocaleString('zh-CN', { hour12: false })}
                        </p>
                        <p className="text-body-sm text-muted mt-1">
                          {formatAssetQuantity(record.quantity, record.asset_type)} · 成交价 {formatAssetPrice(record.price, record.currency, record.asset_type)} · 金额 {formatCurrency(record.amount, record.currency)}
                        </p>
                      </div>
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
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => {
                setShowModal(false);
                resetForm();
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: '100%', scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: '100%', scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full sm:max-w-lg bg-canvas rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-hairline">
                <h2 className="text-title-md font-semibold text-ink">
                  {editingAsset ? '编辑资产' : '添加资产'}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5 max-h-[80vh] overflow-y-auto">
                <div>
                  <label className="block text-caption font-medium text-ink mb-2">
                    搜索资产
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
                      <Search className="w-5 h-5" />
                    </div>
                    <Input
                      value={searchQuery || formData.symbol}
                      onChange={handleSearch}
                      placeholder="输入代码、中文名或英文名"
                      className="pl-12"
                    />
                    {searching && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-5 h-5 animate-spin text-muted" />
                      </div>
                    )}
                    
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-canvas border border-hairline rounded-xl shadow-soft z-10 max-h-64 overflow-y-auto">
                        {searchResults.map((result, index) => (
                          <button
                            key={index}
                            type="button"
                            className="w-full text-left px-5 py-4 hover:bg-surface-soft transition-colors flex items-center"
                            onClick={() => selectSearchResult(result)}
                          >
                            <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center mr-4">
                              <span className="text-title-sm font-semibold text-ink">
                                {result.symbol.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1">
                              <p className="text-title-sm font-semibold text-ink">{result.name}</p>
                              <p className="text-body-sm text-muted">
                                {result.symbol} · {getAssetTypeLabel(result.type)} · {result.currency}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted" />
                          </button>
                        ))}
                      </div>
                    )}
                    {searchQuery && !searching && searchResults.length === 0 && !formData.name && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-canvas border border-hairline rounded-xl shadow-soft z-10 px-5 py-4 text-body-sm text-muted">
                        未找到匹配资产，可手动填写代码和名称
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-caption font-medium text-ink mb-2">
                    名称
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="资产名称"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-caption font-medium text-ink mb-2">
                      类型
                    </label>
                    <Select
                      value={formData.asset_type}
                      onChange={(e) => {
                        const assetType = e.target.value;
                        setFormData({
                          ...formData,
                          asset_type: assetType,
                          currency: getCurrencyForAssetType(assetType),
                        });
                      }}
                    >
                      <option value="us_stock">美股</option>
                      <option value="a_stock">A股</option>
                      <option value="hk_stock">港股</option>
                      <option value="crypto">加密货币</option>
                      <option value="commodity">大宗商品</option>
                      <option value="otc_fund">场外基金</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-caption font-medium text-ink mb-2">
                      货币
                    </label>
                    <Select
                      value={formData.currency}
                      disabled
                    >
                      <option value="CNY">人民币</option>
                      <option value="USD">美元</option>
                      <option value="HKD">港币</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-caption font-medium text-ink mb-2">
                    买入价
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    value={formData.buy_price}
                    onChange={(e) => setFormData({ ...formData, buy_price: e.target.value })}
                    placeholder="买入价格"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-caption font-medium text-ink mb-2">
                      数量
                    </label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value, amount: '' })}
                      placeholder="数量"
                    />
                  </div>
                  <div>
                    <label className="block text-caption font-medium text-ink mb-2">
                      或金额
                    </label>
                    <CurrencyAmountInput
                      currency={formData.currency}
                      value={formData.amount}
                      onChange={(value) => setFormData({ ...formData, amount: value, quantity: '' })}
                      placeholder="总金额"
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <Button type="submit" className="flex-1">
                    {editingAsset ? '保存' : '添加'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                  >
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
              onClick={() => setSellingAsset(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: '100%', scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: '100%', scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full sm:max-w-lg bg-canvas rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-hairline">
                <div>
                  <h2 className="text-title-md font-semibold text-ink">卖出资产</h2>
                  <p className="text-body-sm text-muted mt-1">
                    {sellingAsset.name} · 当前持有 {formatAssetQuantity(sellingAsset.quantity, sellingAsset.asset_type)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSellingAsset(null)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <form onSubmit={handleSellSubmit} className="px-6 py-6 space-y-5">
                <div>
                  <label className="block text-caption font-medium text-ink mb-2">
                    卖出价
                  </label>
                  <Input
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
                      <label className="block text-caption font-medium text-ink">
                        数量
                      </label>
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
                      type="number"
                      step="0.000001"
                      value={sellFormData.quantity}
                      onChange={(e) => setSellFormData({ ...sellFormData, quantity: e.target.value, amount: '' })}
                      placeholder="数量"
                    />
                  </div>
                  <div>
                    <label className="block text-caption font-medium text-ink mb-2">
                      或金额
                    </label>
                    <CurrencyAmountInput
                      currency={sellCurrency}
                      value={sellFormData.amount}
                      onChange={(value) => setSellFormData({ ...sellFormData, amount: value, quantity: '' })}
                      placeholder="卖出金额"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-surface-soft px-4 py-3 text-body-sm text-muted">
                  卖出会记录到交易历史并计算已实现盈亏；如果卖出数量等于当前持仓，将自动清仓。
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <Button type="submit" className="flex-1">
                    确认卖出
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSellingAsset(null)}>
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
