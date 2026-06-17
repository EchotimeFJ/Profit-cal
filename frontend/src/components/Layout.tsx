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
    <div className="min-h-screen bg-canvas">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-hairline bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-8">
            <Link to="/dashboard" className="flex items-center gap-2.5 no-underline">
              <TrendingUp className="h-5 w-5 text-coinbase-blue sm:h-6 sm:w-6" />
              <span className="font-display text-lg font-semibold text-ink sm:text-xl">收益管家</span>
            </Link>

            <div className="hidden md:flex items-center gap-6">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`text-sm font-medium no-underline transition-colors ${
                      isActive ? 'text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-ink leading-5">{user?.username}</p>
              <p className="text-xs text-muted leading-5">{user?.email}</p>
            </div>

            <button
              onClick={toggleTheme}
              className="btn-secondary !px-0 w-11 flex items-center justify-center"
              title={isDark ? '切换为浅色模式' : '切换为黑暗模式'}
              aria-label={isDark ? '切换为浅色模式' : '切换为黑暗模式'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              onClick={handleLogout}
              className="btn-secondary !px-0 w-11 flex items-center justify-center"
              title="退出登录"
              aria-label="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-16 pb-24 md:pb-8">
        <div className="mx-auto max-w-6xl px-0 sm:px-2">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-canvas/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 px-2 py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 no-underline transition-colors ${
                  isActive ? 'bg-surface-soft text-coinbase-blue' : 'text-muted'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
