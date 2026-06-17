import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Loader2 } from 'lucide-react';

export const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      await register(username, email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || '注册失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center mb-5 sm:mb-6">
            <TrendingUp className="w-11 h-11 sm:w-12 sm:h-12 text-coinbase-blue" />
          </div>
          <h1 className="font-display text-[40px] leading-none sm:text-[52px] font-medium text-on-dark mb-3 sm:mb-4">收益管家</h1>
          <p className="text-sm sm:text-base text-on-dark-soft">
            管理资产、查看收益、跟踪实时价格
          </p>
        </div>

        {/* Register Card */}
        <div className="card-dark">
          <h2 className="font-display text-[28px] sm:text-[32px] font-medium text-on-dark mb-6 sm:mb-8 leading-tight">创建账户</h2>

          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            <div>
              <label className="block text-sm font-medium text-on-dark mb-2">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                required
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-on-dark mb-2">
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱"
                required
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-on-dark mb-2">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-on-dark mb-2">
                确认密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
                required
                className="input w-full"
              />
            </div>

            {error && (
              <div className="text-semantic-down text-sm font-medium">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-12"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  创建中...
                </>
              ) : (
                '创建账户'
              )}
            </button>
          </form>

          <div className="mt-6 sm:mt-8 text-center">
            <p className="text-sm sm:text-base text-on-dark-soft">
              已有账户？{' '}
              <Link
                to="/login"
                className="text-coinbase-blue hover:underline font-medium"
              >
                去登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
