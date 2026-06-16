import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency: string = 'CNY'): string {
  const currencySymbols: Record<string, string> = {
    CNY: '¥',
    USD: '$',
    HKD: 'HK$',
    USDT: '₮',
  };

  const symbol = currencySymbols[currency] || currency;
  
  return `${symbol}${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function getAssetTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    a_stock: 'A股',
    hk_stock: '港股',
    us_stock: '美股',
    crypto: '加密货币',
    commodity: '大宗商品',
  };
  return labels[type] || type;
}

export function getAssetQuantityUnit(type: string): string {
  const units: Record<string, string> = {
    a_stock: '股',
    hk_stock: '股',
    us_stock: '股',
    crypto: '个',
    commodity: '份',
  };
  return units[type] || '份';
}

export function formatAssetQuantity(quantity: number, type: string): string {
  return `${quantity.toLocaleString('zh-CN')}${getAssetQuantityUnit(type)}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}
