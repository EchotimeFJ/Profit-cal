import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import {
  Plus,
  Bell,
  Trash2,
  Edit2,
  X,
  Clock,
  CheckCircle2,
  Loader2,
  PencilLine,
} from 'lucide-react';
import { api } from '../lib/api';
import { Alert, Asset } from '../types';
import { formatCurrency, getAssetTypeLabel } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type AlertMode = 'asset' | 'manual';

const notificationOptions = [
  { value: 'browser', label: '浏览器弹窗' },
  { value: 'sound', label: '声音提醒' },
  { value: 'vibrate', label: '震动提醒' },
  { value: 'both', label: '弹窗 + 声音' },
];

const assetTypeOptions = [
  { value: 'a_stock', label: 'A股' },
  { value: 'otc_fund', label: '场外基金' },
  { value: 'hk_stock', label: '港股' },
  { value: 'us_stock', label: '美股' },
  { value: 'crypto', label: '加密货币' },
  { value: 'commodity', label: '大宗商品' },
];

const notificationLabel = (value: string) => {
  if (value === 'browser' || value === 'popup') return '浏览器弹窗';
  if (value === 'sound') return '声音提醒';
  if (value === 'vibrate') return '震动提醒';
  return '弹窗 + 声音';
};

const alertTypeLabel = (value: 'above' | 'below' | 'reach') => {
  if (value === 'above') return '超过';
  if (value === 'below') return '低于';
  return '到达';
};

export const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);
  const [mode, setMode] = useState<AlertMode>('asset');

  const [formData, setFormData] = useState({
    asset_id: '',
    name: '',
    symbol: '',
    asset_type: 'a_stock',
    target_price: '',
    alert_type: 'above' as 'above' | 'below' | 'reach',
    notification_method: 'browser',
  });
  const isEditing = Boolean(editingAlert);

  const fetchData = async () => {
    try {
      const [alertsData, assetsData] = await Promise.all([
        api.get<{ alerts: Alert[] }>('/alerts'),
        api.get<{ assets: Asset[] }>('/assets'),
      ]);
      setAlerts(alertsData.alerts);
      setAssets(assetsData.assets);
    } catch (error) {
      console.error('获取提醒数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const baseData = {
        target_price: parseFloat(formData.target_price),
        alert_type: formData.alert_type,
        notification_method: formData.notification_method,
      };

      const payload = mode === 'asset'
        ? {
            ...baseData,
            asset_id: parseInt(formData.asset_id),
          }
        : {
            ...baseData,
            name: formData.name.trim() || formData.symbol.trim().toUpperCase(),
            symbol: formData.symbol.trim(),
            asset_type: formData.asset_type,
          };

      if (editingAlert) {
        await api.put(`/alerts/${editingAlert.id}`, payload);
      } else {
        await api.post('/alerts', payload);
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      alert(error.message || '操作失败');
    }
  };

  const handleEdit = (alert: Alert) => {
    setEditingAlert(alert);
    setMode(alert.kind === 'manual' ? 'manual' : 'asset');
    setFormData({
      asset_id: alert.asset_id ? String(alert.asset_id) : '',
      name: alert.name || '',
      symbol: alert.symbol || '',
      asset_type: alert.asset_type || 'a_stock',
      target_price: alert.target_price.toString(),
      alert_type: alert.alert_type,
      notification_method: alert.notification_method === 'popup' ? 'browser' : (alert.notification_method || 'browser'),
    });
    setShowModal(true);
  };

  const handleDelete = async (alertId: string) => {
    if (confirm('确定要删除这个提醒吗？')) {
      try {
        await api.delete(`/alerts/${alertId}`);
        fetchData();
      } catch (error) {
        console.error('删除提醒失败:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      asset_id: '',
      name: '',
      symbol: '',
      asset_type: 'a_stock',
      target_price: '',
      alert_type: 'above' as 'above' | 'below' | 'reach',
      notification_method: 'browser',
    });
    setMode('asset');
    setEditingAlert(null);
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
          <h1 className="text-title-lg font-bold text-ink mb-1">价格提醒</h1>
          <p className="text-body text-muted">支持持仓提醒，也支持手动输入代码或品种设置提醒</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="w-full sm:w-auto">
          <Plus className="w-5 h-5 mr-2" />
          添加提醒
        </Button>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <div className="w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted" />
            </div>
            <h3 className="text-title-md font-semibold text-ink mb-2">还没有设置任何价格提醒</h3>
            <p className="text-body text-muted mb-6">可以从持仓里选，也可以手动输入代码和资产类型</p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-5 h-5 mr-2" />
              添加第一个提醒
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert, index) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={alert.triggered ? 'opacity-60' : ''}>
                <CardContent className="py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start sm:items-center flex-1 min-w-0">
                      <div className="w-12 h-12 bg-surface-soft rounded-full flex items-center justify-center mr-3 sm:mr-4 shrink-0">
                        {alert.kind === 'manual' ? (
                          <PencilLine className="w-6 h-6 text-coinbase-blue" />
                        ) : alert.triggered ? (
                          <CheckCircle2 className="w-6 h-6 text-semantic-up" />
                        ) : alert.is_active ? (
                          <Bell className="w-6 h-6 text-coinbase-blue" />
                        ) : (
                          <Clock className="w-6 h-6 text-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="text-title-sm font-semibold text-ink">
                            {alert.name}
                          </h3>
                          <span className="text-caption px-2 py-0.5 bg-surface-soft text-muted rounded-full">
                            {alert.kind === 'manual' ? '手动' : '持仓'}
                          </span>
                          {alert.asset_type && (
                            <span className="text-caption px-2 py-0.5 bg-surface-soft text-muted rounded-full">
                              {getAssetTypeLabel(alert.asset_type)}
                            </span>
                          )}
                        </div>
                        <p className="text-body-sm text-muted break-all">
                          {alert.symbol} · 当价格 {alertTypeLabel(alert.alert_type)} {formatCurrency(alert.target_price, alert.currency || 'USD')}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-muted mt-2">
                          <span>{notificationLabel(alert.notification_method)}</span>
                          {alert.triggered && (
                            <span className="flex items-center text-semantic-up">
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              已触发
                            </span>
                          )}
                          {!alert.is_active && (
                            <span className="flex items-center">
                              <Clock className="w-4 h-4 mr-1" />
                              已暂停
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(alert)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(alert.id)}>
                        <Trash2 className="w-4 h-4 text-semantic-down" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
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
                  {editingAlert ? '编辑提醒' : '添加提醒'}
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

              <div className="px-6 pt-5">
                {isEditing && (
                  <p className="mb-3 text-caption text-muted">编辑已有提醒时不支持切换提醒来源</p>
                )}
                <div className="flex items-center gap-2 rounded-xl bg-surface-soft p-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      mode === 'asset' ? 'bg-canvas text-ink shadow-soft' : 'text-muted'
                    }`}
                    onClick={() => {
                      if (!isEditing) setMode('asset');
                    }}
                    disabled={isEditing}
                  >
                    持仓提醒
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      mode === 'manual' ? 'bg-canvas text-ink shadow-soft' : 'text-muted'
                    }`}
                    onClick={() => {
                      if (!isEditing) setMode('manual');
                    }}
                    disabled={isEditing}
                  >
                    手动输入
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5 max-h-[80vh] overflow-y-auto">
                {mode === 'asset' ? (
                  <div>
                    <label className="block text-caption font-medium text-ink mb-2">选择持仓</label>
                    <Select
                      value={formData.asset_id}
                      onChange={(e) => setFormData({ ...formData, asset_id: e.target.value })}
                      disabled={isEditing}
                      required
                    >
                      <option value="">请选择资产</option>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name} ({asset.symbol})
                        </option>
                      ))}
                    </Select>
                    {isEditing && (
                      <p className="mt-2 text-caption text-muted">编辑已有持仓提醒时不支持更换持仓</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-caption font-medium text-ink mb-2">名称</label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="可选，不填则使用代码"
                        />
                      </div>
                      <div>
                        <label className="block text-caption font-medium text-ink mb-2">类型</label>
                        <Select
                          value={formData.asset_type}
                          onChange={(e) => setFormData({ ...formData, asset_type: e.target.value })}
                        >
                          {assetTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-caption font-medium text-ink mb-2">代码 / 品种</label>
                      <Input
                        value={formData.symbol}
                        onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                        placeholder="例如 600519、0700、BTC、GC=F"
                        required
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-caption font-medium text-ink mb-2">提醒类型</label>
                    <Select
                      value={formData.alert_type}
                      onChange={(e) => setFormData({ ...formData, alert_type: e.target.value as 'above' | 'below' | 'reach' })}
                    >
                      <option value="above">价格超过...</option>
                      <option value="below">价格低于...</option>
                      <option value="reach">价格到达...</option>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-caption font-medium text-ink mb-2">目标价格</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.target_price}
                      onChange={(e) => setFormData({ ...formData, target_price: e.target.value })}
                      placeholder="目标价格"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-caption font-medium text-ink mb-2">提醒方式</label>
                  <Select
                    value={formData.notification_method}
                    onChange={(e) => setFormData({ ...formData, notification_method: e.target.value })}
                  >
                    {notificationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="rounded-xl bg-surface-soft px-4 py-3 text-body-sm text-muted">
                  浏览器弹窗需要允许通知权限；声音提醒会在触发时播放提示音。
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <Button type="submit" className="flex-1">
                    {editingAlert ? '保存' : '添加'}
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
      </AnimatePresence>
    </div>
  );
};
