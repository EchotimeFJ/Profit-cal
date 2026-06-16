import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Moon, Settings as SettingsIcon, User, Globe, Save, Loader2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export const Settings: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { isDark, setTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    preferred_currency: user?.preferred_currency || 'CNY',
  });
  const handleThemeChange = (enabled: boolean) => {
    setTheme(enabled ? 'dark' : 'light');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateUser(formData);
      alert('设置已保存！');
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-title-lg font-bold text-ink mb-1">设置</h1>
        <p className="text-body text-muted">管理您的账户和偏好</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-muted" />
              </div>
              <CardTitle>个人资料</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-caption font-medium text-ink mb-2">
                  用户名
                </label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-caption font-medium text-ink mb-2">
                  邮箱
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    保存更改
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center">
                <Globe className="w-5 h-5 text-muted" />
              </div>
              <CardTitle>偏好设置</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-caption font-medium text-ink mb-2">
                  默认结算货币
                </label>
                <Select
                  value={formData.preferred_currency}
                  onChange={(e) => setFormData({ ...formData, preferred_currency: e.target.value })}
                >
                  <option value="CNY">人民币 (CNY)</option>
                  <option value="USD">美元 (USD)</option>
                  <option value="HKD">港币 (HKD)</option>
                </Select>
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    保存更改
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center">
                <Moon className="w-5 h-5 text-muted" />
              </div>
              <CardTitle>显示设置</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-title-sm text-ink">黑暗模式</p>
                <p className="text-body-sm text-muted mt-1">切换为深色界面，适合夜间查看资产变化</p>
              </div>
              <input
                type="checkbox"
                checked={isDark}
                onChange={(e) => handleThemeChange(e.target.checked)}
                className="h-5 w-5 accent-coinbase-blue"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center">
                <SettingsIcon className="w-5 h-5 text-muted" />
              </div>
              <CardTitle>关于</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-muted space-y-2">
              <p className="text-body"><strong className="text-ink">收益管家</strong> - 资产管理与价格监控</p>
              <p className="text-body-sm">版本 1.0.0</p>
              <p className="text-body-sm mt-4 text-muted-soft">
                数据来源：腾讯行情、Gate.io、Tushare 日线兜底
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
