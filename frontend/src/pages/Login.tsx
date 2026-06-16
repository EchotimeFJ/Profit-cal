import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
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
      await login(username, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-dark" style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            marginBottom: '24px' 
          }}>
            <TrendingUp style={{ width: '48px', height: '48px', color: '#0052ff' }} />
          </div>
          <h1 style={{ 
            fontSize: '52px', 
            fontWeight: '500', 
            lineHeight: '1', 
            letterSpacing: 0,
            color: '#ffffff',
            marginBottom: '16px'
          }} className="font-display">
            收益管家
          </h1>
          <p style={{ fontSize: '16px', color: '#a8acb3' }}>
            管理资产、查看收益、跟踪实时价格
          </p>
        </div>

        {/* Login Card */}
        <div className="card-dark">
          <h2 style={{ 
            fontSize: '32px', 
            fontWeight: '500', 
            color: '#ffffff',
            marginBottom: '32px',
            letterSpacing: 0,
            lineHeight: '1.13'
          }} className="font-display">
            登录账户
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#ffffff', 
                marginBottom: '8px' 
              }}>
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                required
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#ffffff', 
                marginBottom: '8px' 
              }}>
                密码
              </label>
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

            {error && (
              <div style={{ 
                color: '#cf202f', 
                fontSize: '14px', 
                fontWeight: '500' 
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ 
                width: '100%', 
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
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

          <div style={{ marginTop: '32px', textAlign: 'center' }}>
            <p style={{ fontSize: '16px', color: '#a8acb3' }}>
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
