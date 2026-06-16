import sys
sys.path.insert(0, '/Users/frankjia/project/Profit_Cal/backend')

from services.price_fetcher import PriceFetcher
import json

# 测试数据源
test_cases = [
    ('BTC', 'crypto', 'BTC加密货币'),
    ('0700.HK', 'hk_stock', '腾讯港股'),
    ('000858.SZ', 'a_stock', '五粮液A股'),
    ('CL=F', 'commodity', 'WTI原油'),
    ('XAU=X', 'commodity', '黄金'),
    ('GC=F', 'commodity', '黄金期货'),
    ('XAUT', 'crypto', 'PAX Gold代币'),
]

print("=" * 60)
print("价格获取测试")
print("=" * 60)

for symbol, asset_type, name in test_cases:
    print(f"\n{name} ({symbol}):")
    print("-" * 40)
    
    try:
        if asset_type == 'crypto':
            price_data = PriceFetcher.get_crypto_price(symbol)
        elif asset_type == 'hk_stock':
            price_data = PriceFetcher.get_stock_price(symbol, 'hk_stock')
        elif asset_type == 'a_stock':
            price_data = PriceFetcher.get_stock_price(symbol, 'a_stock')
        elif asset_type == 'commodity':
            price_data = PriceFetcher.get_commodity_price(symbol)
        else:
            price_data = PriceFetcher.get_price(symbol, asset_type)
        
        if price_data:
            print(f"  ✅ 当前价格: ${price_data['current_price']:.2f}")
            print(f"     昨日收盘: ${price_data['previous_close']:.2f}")
            print(f"     货币: {price_data['currency']}")
            
            change = price_data['current_price'] - price_data['previous_close']
            change_pct = (change / price_data['previous_close'] * 100) if price_data['previous_close'] > 0 else 0
            print(f"     涨跌: {change:+.2f} ({change_pct:+.2f}%)")
        else:
            print(f"  ❌ 无法获取价格")
            
    except Exception as e:
        print(f"  ❌ 错误: {str(e)}")

print("\n" + "=" * 60)

# 测试汇率
print("\n汇率获取测试:")
print("-" * 40)
try:
    rate = PriceFetcher.get_exchange_rate('USD', 'CNY')
    print(f"USD -> CNY: {rate:.4f}")
    
    rate2 = PriceFetcher.get_exchange_rate('CNY', 'USD')
    print(f"CNY -> USD: {rate2:.4f}")
except Exception as e:
    print(f"  ❌ 错误: {str(e)}")
