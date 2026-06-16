export interface User {
  id: number;
  username: string;
  email: string;
  preferred_currency: string;
  created_at: string;
}

export interface Asset {
  id: number;
  name: string;
  symbol: string;
  asset_type: string;
  buy_price: number;
  quantity: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface TradeRecord {
  id: number;
  user_id: number;
  asset_id: number | null;
  action: 'buy' | 'sell';
  asset_name: string;
  symbol: string;
  asset_type: string;
  price: number;
  quantity: number;
  amount: number;
  currency: string;
  cost_basis: number | null;
  realized_profit: number | null;
  realized_profit_percent: number | null;
  created_at: string;
}

export interface PortfolioAsset extends Asset {
  current_price: number | null;
  current_price_original: number | null;
  previous_close: number | null;
  profit: number | null;
  profit_percent: number | null;
  daily_profit: number | null;
  investment: number | null;
  current_value: number | null;
  error?: string;
}

export interface Alert {
  id: number;
  asset_id: number;
  target_price: number;
  alert_type: 'above' | 'below';
  is_active: boolean;
  notification_method: string;
  triggered: boolean;
  triggered_at: string | null;
  created_at: string;
}

export interface PortfolioSummary {
  total_investment: number;
  total_current_value: number;
  total_profit: number;
  total_profit_percent: number;
  daily_profit: number;
  currency: string;
}

export interface PortfolioData {
  portfolio: PortfolioAsset[];
  summary: PortfolioSummary;
  summary_by_currency?: Record<string, PortfolioSummary>;
  settlement_currency?: string;
  exchange_rates?: Record<string, number>;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
