import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  TrendingUp,
  Wallet,
  Bell,
  Settings,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', label: '总览', icon: TrendingUp },
    { path: '/assets', label: '资产', icon: Wallet },
    { path: '/alerts', label: '提醒', icon: Bell },
    { path: '/settings', label: '设置', icon: Settings },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-canvas)' }}>
      {/* Top Navigation - Light */}
      <nav style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: '64px',
        backgroundColor: 'var(--color-canvas)',
        borderBottom: '1px solid var(--color-hairline)'
      }}>
        <div style={{ 
          maxWidth: '1248px',
          margin: '0 auto',
          padding: '0 24px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <Link to="/dashboard" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              textDecoration: 'none' 
            }}>
              <TrendingUp style={{ width: '24px', height: '24px', color: 'var(--color-coinbase-blue)' }} />
              <span style={{ 
                fontSize: '20px', 
                fontWeight: '600', 
                color: 'var(--color-ink)',
                fontFamily: '"Inter", "Noto Sans SC", -apple-system, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
              }} className="font-display">
                收益管家
              </span>
            </Link>
            
            {/* Desktop Navigation */}
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '24px'
            }}>
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: isActive ? 'var(--color-ink)' : 'var(--color-muted)',
                      textDecoration: 'none',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--color-ink)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--color-muted)'; }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={toggleTheme}
              className="btn-secondary"
              style={{
                width: '44px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={isDark ? '切换为浅色模式' : '切换为黑暗模式'}
              aria-label={isDark ? '切换为浅色模式' : '切换为黑暗模式'}
            >
              {isDark ? (
                <Sun style={{ width: '16px', height: '16px' }} />
              ) : (
                <Moon style={{ width: '16px', height: '16px' }} />
              )}
            </button>

            {/* User info */}
            <div style={{ textAlign: 'right' }}>
              <p style={{ 
                fontSize: '14px', 
                fontWeight: '600', 
                color: 'var(--color-ink)',
                lineHeight: '1.5'
              }}>
                {user?.username}
              </p>
              <p style={{ 
                fontSize: '12px', 
                color: 'var(--color-muted)',
                lineHeight: '1.5'
              }}>
                {user?.email}
              </p>
            </div>
            
            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              title="退出登录"
            >
              <LogOut style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ paddingTop: '64px' }}>
        <div style={{ 
          maxWidth: '1248px',
          margin: '0 auto',
          padding: '24px'
        }}>
          {children}
        </div>
      </main>
    </div>
  );
};
