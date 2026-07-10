import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import {
  Moon,
  Settings as SettingsIcon,
  User,
  Save,
  Loader2,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export const Settings: React.FC = () => {
  const { user, updateUser, changePassword } = useAuth();
  const { isDark, setTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    preferred_currency: user?.preferred_currency || 'CNY',
  });
  const [passwordForm, setPasswordForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    setFormData({
      username: user?.username || '',
      email: user?.email || '',
      preferred_currency: user?.preferred_currency || 'CNY',
    });
  }, [user?.username, user?.email, user?.preferred_currency]);

  const handleThemeChange = (enabled: boolean) => {
    setTheme(enabled ? 'dark' : 'light');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setProfileMessage('');

    try {
      await updateUser(formData);
      setProfileMessage('设置已保存');
    } catch (error: any) {
      setProfileMessage(error.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordLoading) return;

    setPasswordMessage('');

    const normalizedEmail = passwordForm.email.trim().toLowerCase();
    const currentEmail = (user?.email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      setPasswordMessage('请输入绑定邮箱');
      return;
    }

    if (normalizedEmail !== currentEmail) {
      setPasswordMessage('绑定邮箱校验失败');
      return;
    }

    if (passwordForm.password.length < 6) {
      setPasswordMessage('新密码至少需要 6 位');
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordMessage('两次输入的新密码不一致');
      return;
    }

    setPasswordLoading(true);

    try {
      await changePassword(passwordForm.email.trim(), passwordForm.password);
      setPasswordForm({
        email: '',
        password: '',
        confirmPassword: '',
      });
      setPasswordMessage('密码修改成功');
    } catch (error: any) {
      setPasswordMessage(error.message || '密码修改失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-title-lg font-bold text-ink mb-1">设置</h1>
        <p className="text-body text-muted">管理账户资料、结算偏好与登录安全</p>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="pb-4 p-5 sm:p-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-muted" />
              </div>
              <CardTitle>个人资料</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-xl">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-username" className="block text-caption font-medium text-ink mb-2">用户名</label>
                  <Input
                    id="settings-username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="settings-email" className="block text-caption font-medium text-ink mb-2">邮箱</label>
                  <Input
                    id="settings-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-preferred-currency" className="block text-caption font-medium text-ink mb-2">默认结算货币</label>
                  <Select
                    id="settings-preferred-currency"
                    value={formData.preferred_currency}
                    onChange={(e) => setFormData({ ...formData, preferred_currency: e.target.value })}
                  >
                    <option value="CNY">人民币 (CNY)</option>
                    <option value="USD">美元 (USD)</option>
                    <option value="HKD">港币 (HKD)</option>
                  </Select>
                </div>

                <div className="rounded-xl bg-surface-soft px-4 py-3 text-body-sm text-muted flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-coinbase-blue shrink-0" />
                  登录状态下修改资料会立即同步到账户信息。
                </div>
              </div>

              {profileMessage && (
                <div className={`text-body-sm font-medium ${profileMessage.includes('成功') || profileMessage.includes('保存') ? 'text-semantic-up' : 'text-semantic-down'}`}>
                  {profileMessage}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
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
          <CardHeader className="pb-4 p-5 sm:p-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-muted" />
              </div>
              <CardTitle>修改密码</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-xl">
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="rounded-xl bg-surface-soft px-4 py-3 text-body-sm text-muted">
                输入当前绑定邮箱进行校验，校验通过后即可修改密码。
              </div>

              <div>
                <label htmlFor="settings-password-email" className="block text-caption font-medium text-ink mb-2">绑定邮箱</label>
                <Input
                  id="settings-password-email"
                  type="email"
                  value={passwordForm.email}
                  onChange={(e) => setPasswordForm({ ...passwordForm, email: e.target.value })}
                  placeholder="请输入当前绑定邮箱"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-new-password" className="block text-caption font-medium text-ink mb-2">新密码</label>
                  <Input
                    id="settings-new-password"
                    type="password"
                    value={passwordForm.password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                    placeholder="至少 6 位"
                  />
                </div>

                <div>
                  <label htmlFor="settings-confirm-password" className="block text-caption font-medium text-ink mb-2">确认新密码</label>
                  <Input
                    id="settings-confirm-password"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="再次输入新密码"
                  />
                </div>
              </div>

              {passwordMessage && (
                <div className={`text-body-sm font-medium ${passwordMessage.includes('成功') ? 'text-semantic-up' : 'text-semantic-down'}`}>
                  {passwordMessage}
                </div>
              )}

              <Button type="submit" disabled={passwordLoading} className="w-full sm:w-auto">
                {passwordLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    提交中...
                  </>
                ) : (
                  '更新密码'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4 p-5 sm:p-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center shrink-0">
                <Moon className="w-5 h-5 text-muted" />
              </div>
              <CardTitle>显示设置</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-xl">
            <label htmlFor="settings-dark-mode" className="flex items-start sm:items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-title-sm text-ink">黑暗模式</p>
                <p className="text-body-sm text-muted mt-1">切换为深色界面，适合夜间查看资产变化</p>
              </div>
              <input
                id="settings-dark-mode"
                type="checkbox"
                checked={isDark}
                onChange={(e) => handleThemeChange(e.target.checked)}
                className="mt-1 sm:mt-0 h-5 w-5 accent-coinbase-blue shrink-0"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4 p-5 sm:p-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-surface-soft rounded-full flex items-center justify-center shrink-0">
                <SettingsIcon className="w-5 h-5 text-muted" />
              </div>
              <CardTitle>关于</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-xl">
            <div className="text-muted space-y-2">
              <p className="text-body">
                <strong className="text-ink">收益管家</strong> - 资产管理与价格监控
              </p>
              <p className="text-body-sm">版本 1.0.0</p>
              <p className="text-body-sm mt-4 text-muted-soft">数据来源：腾讯行情、Gate.io、Tushare 日线兜底</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
