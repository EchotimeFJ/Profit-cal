import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(identifier, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || '登录失败，请检查账号/邮箱和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-dark min-h-screen flex items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center mb-5 sm:mb-6">
            <TrendingUp className="w-11 h-11 sm:w-12 sm:h-12 text-coinbase-blue" />
          </div>
          <h1 className="font-display text-[40px] leading-none sm:text-[52px] font-medium text-on-dark mb-3 sm:mb-4">
            收益管家
          </h1>
          <p className="text-sm sm:text-base text-on-dark-soft">
            管理资产、查看收益、跟踪实时价格
          </p>
        </div>

        {/* Login Card */}
        <div className="card-dark">
          <h2 className="font-display text-[28px] sm:text-[32px] font-medium text-on-dark mb-6 sm:mb-8 leading-tight">
            登录账户
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 sm:gap-6">
            <div>
              <label className="block text-sm font-medium text-on-dark mb-2">账号或绑定邮箱</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="请输入账号或绑定邮箱"
                required
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-on-dark mb-2">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            <div className="-mt-3 text-right">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-coinbase-blue hover:underline"
              >
                忘记密码？
              </Link>
            </div>

            {error && (
              <div className="text-semantic-down text-sm font-medium">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ width: '100%', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loading ? (
                <>
                  <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </button>
          </form>

          <div className="mt-6 sm:mt-8 text-center">
            <p className="text-sm sm:text-base text-on-dark-soft">
              还没有账户？{' '}
              <Link
                to="/register"
                style={{ color: '#0052ff', fontWeight: '600', textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
              >
                立即注册
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
