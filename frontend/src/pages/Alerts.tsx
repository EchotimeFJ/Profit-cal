import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Plus, Bell, Trash2, Edit2, X, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { Alert, Asset } from '../types';
import { formatCurrency, getAssetTypeLabel } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);

  const [formData, setFormData] = useState({
    asset_id: '',
    target_price: '',
    alert_type: 'above',
    notification_method: 'popup',
  });

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
      const data = {
        ...formData,
        asset_id: parseInt(formData.asset_id),
        target_price: parseFloat(formData.target_price),
      };

      if (editingAlert) {
        await api.put(`/alerts/${editingAlert.id}`, data);
      } else {
        await api.post('/alerts', data);
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
    setFormData({
      asset_id: alert.asset_id.toString(),
      target_price: alert.target_price.toString(),
      alert_type: alert.alert_type,
      notification_method: alert.notification_method,
    });
    setShowModal(true);
  };

  const handleDelete = async (alertId: number) => {
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
      target_price: '',
      alert_type: 'above',
      notification_method: 'popup',
    });
    setEditingAlert(null);
  };

  const getAssetById = (id: number) => assets.find(a => a.id === id);

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
          <p className="text-body text-muted">设置价格预警，不错过任何机会</p>
        </div>
        {assets.length > 0 && (
          <Button onClick={() => setShowModal(true)} className="w-full sm:w-auto">
            <Plus className="w-5 h-5 mr-2" />
            添加提醒
          </Button>
        )}
      </div>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <div className="w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted" />
            </div>
            <h3 className="text-title-md font-semibold text-ink mb-2">请先添加资产</h3>
            <p className="text-body text-muted">添加资产后再设置价格提醒</p>
          </CardContent>
        </Card>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <div className="w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted" />
            </div>
            <h3 className="text-title-md font-semibold text-ink mb-2">还没有设置任何价格提醒</h3>
            <p className="text-body text-muted mb-6">设置价格预警，不错过任何机会</p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-5 h-5 mr-2" />
              添加第一个提醒
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert, index) => {
            const asset = getAssetById(alert.asset_id);
            return (
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
                          {alert.triggered ? (
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
                              {asset?.name || '未知资产'}
                            </h3>
                            {asset && (
                              <span className="text-caption px-2 py-0.5 bg-surface-soft text-muted rounded-full">
                                {getAssetTypeLabel(asset.asset_type)}
                              </span>
                            )}
                          </div>
                          <p className="text-body-sm text-muted mb-2">
                            当价格 {alert.alert_type === 'above' ? '超过' : '低于'}{' '}
                            <span className="font-semibold text-ink">
                              {formatCurrency(alert.target_price, asset?.currency || 'USD')}
                            </span>{' '}
                            时提醒
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-muted">
                            <span>
                              {alert.notification_method === 'popup' ? '弹窗提醒' : 
                               alert.notification_method === 'vibrate' ? '震动提醒' : '两者都有'}
                            </span>
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
            );
          })}
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

              <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5 max-h-[80vh] overflow-y-auto">
                <div>
                  <label className="block text-caption font-medium text-ink mb-2">
                    选择资产
                  </label>
                  <Select
                    value={formData.asset_id}
                    onChange={(e) => setFormData({ ...formData, asset_id: e.target.value })}
                    required
                  >
                    <option value="">请选择资产</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name} ({asset.symbol})
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-caption font-medium text-ink mb-2">
                    提醒类型
                  </label>
                  <Select
                    value={formData.alert_type}
                    onChange={(e) => setFormData({ ...formData, alert_type: e.target.value as 'above' | 'below' })}
                  >
                    <option value="above">价格超过...</option>
                    <option value="below">价格低于...</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-caption font-medium text-ink mb-2">
                    目标价格
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.target_price}
                    onChange={(e) => setFormData({ ...formData, target_price: e.target.value })}
                    placeholder="目标价格"
                    required
                  />
                </div>

                <div>
                  <label className="block text-caption font-medium text-ink mb-2">
                    提醒方式
                  </label>
                  <Select
                    value={formData.notification_method}
                    onChange={(e) => setFormData({ ...formData, notification_method: e.target.value })}
                  >
                    <option value="popup">弹窗提醒</option>
                    <option value="vibrate">震动提醒</option>
                    <option value="both">两者都有</option>
                  </Select>
                </div>

                <div className="flex space-x-3 pt-2">
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
