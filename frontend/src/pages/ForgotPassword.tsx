import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, Loader2, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setMessage('');
    setIsSuccess(false);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setMessage('请输入绑定邮箱');
      return;
    }

    if (password.length < 6) {
      setMessage('新密码至少需要 6 位');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('两次输入的新密码不一致');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(normalizedEmail, password);
      setIsSuccess(true);
      setMessage('密码已重置，请使用新密码登录');
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => navigate('/login'), 900);
    } catch (err: any) {
      setMessage(err.message || '密码重置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center mb-5 sm:mb-6">
            <TrendingUp className="w-11 h-11 sm:w-12 sm:h-12 text-coinbase-blue" />
          </div>
          <h1 className="font-display text-[40px] leading-none sm:text-[52px] font-medium text-on-dark mb-3 sm:mb-4">
            收益管家
          </h1>
          <p className="text-sm sm:text-base text-on-dark-soft">
            使用绑定邮箱重置登录密码
          </p>
        </div>

        <div className="card-dark">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <div className="w-11 h-11 rounded-full bg-surface-soft flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-on-dark-soft" />
            </div>
            <h2 className="font-display text-[28px] sm:text-[32px] font-medium text-on-dark leading-tight">
              忘记密码
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-on-dark mb-2">
                绑定邮箱
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入注册时绑定的邮箱"
                required
                className="input w-full"
              />
              <p className="mt-2 text-xs text-on-dark-soft">
                邮箱校验通过后，会直接将账户密码修改为下方新密码。
              </p>
            </div>

            <div>
              <label htmlFor="forgot-password" className="block text-sm font-medium text-on-dark mb-2">
                新密码
              </label>
              <input
                id="forgot-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                required
                className="input w-full"
              />
            </div>

            <div>
              <label htmlFor="forgot-confirm-password" className="block text-sm font-medium text-on-dark mb-2">
                确认新密码
              </label>
              <input
                id="forgot-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                required
                className="input w-full"
              />
            </div>

            {message && (
              <div className={`text-sm font-medium ${isSuccess ? 'text-semantic-up' : 'text-semantic-down'}`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-12"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  提交中...
                </>
              ) : (
                '重置密码'
              )}
            </button>
          </form>

          <div className="mt-6 sm:mt-8 text-center">
            <p className="text-sm sm:text-base text-on-dark-soft">
              想起密码了？{' '}
              <Link
                to="/login"
                className="text-coinbase-blue hover:underline font-medium"
              >
                返回登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
