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
  daily_profit_percent?: number | null;
  display_profit?: number | null;
  display_daily_profit?: number | null;
  display_profit_currency?: string;
  pnl_display_mode?: string;
  investment: number | null;
  current_value: number | null;
  sort_current_value_base?: number | null;
  sort_profit_base?: number | null;
  type_sort_order?: number;
  error?: string;
}

export interface Alert {
  id: string;
  kind: 'asset' | 'manual';
  asset_id: number | null;
  name: string;
  symbol: string;
  asset_type: string;
  currency: string;
  target_price: number;
  alert_type: 'above' | 'below' | 'reach';
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
  pnl_display_mode?: string;
  exchange_rates?: Record<string, number>;
  pnl_exchange_rates?: Record<string, Record<string, number>>;
  updated_at?: string;
  cached?: boolean;
}

export interface AssetDetailPerformance {
  investment: number;
  current_value: number | null;
  unrealized_profit: number | null;
  unrealized_profit_percent: number | null;
  daily_profit: number | null;
  daily_profit_percent: number | null;
  realized_profit: number;
  realized_profit_percent: number | null;
}

export interface AssetDetailPrice {
  current_price: number | null;
  previous_close: number | null;
  currency: string;
  source: string | null;
  quote_time: string | null;
  error: string | null;
}

export interface AssetDetailData {
  asset: Asset;
  price: AssetDetailPrice;
  performance: AssetDetailPerformance;
  records: TradeRecord[];
}

export interface PortfolioHistoryPoint {
  date: string;
  total_investment: number;
  total_current_value: number;
  total_profit: number;
  total_profit_percent: number;
  daily_profit: number;
}

export interface PortfolioHistoryData {
  currency: string;
  points: PortfolioHistoryPoint[];
}

export interface ClosedPositionSummary {
  closed_count: number;
  total_realized_profit: number;
  win_count: number;
  loss_count: number;
  win_rate: number | null;
  average_realized_profit_percent: number | null;
  average_holding_days: number | null;
}

export interface ClosedPositionItem {
  asset_id: number;
  asset_name: string;
  symbol: string;
  asset_type: string;
  currency: string;
  buy_quantity: number;
  sell_quantity: number;
  total_cost: number;
  total_proceeds: number;
  realized_profit: number;
  realized_profit_percent: number | null;
  first_buy_at: string;
  closed_at: string;
  holding_days: number;
  records: TradeRecord[];
}

export interface ClosedPositionsData {
  summary: ClosedPositionSummary;
  positions: ClosedPositionItem[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
