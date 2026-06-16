import sys
sys.path.insert(0, '/Users/frankjia/project/Profit_Cal/backend')

from services.price_fetcher import PriceFetcher
import json

# 测试数据源
test_cases = [
    ('BTC', 'crypto', 'BTC加密货币'),
    ('XAUT', 'crypto', 'XAUT (Tether Gold)'),
    ('0700.HK', 'hk_stock', '腾讯港股'),
    ('9988.HK', 'hk_stock', '阿里巴巴港股'),
    ('000858.SZ', 'a_stock', '五粮液A股'),
    ('600519.SS', 'a_stock', '贵州茅台A股'),
    ('CL=F', 'commodity', 'WTI原油'),
    ('GC=F', 'commodity', '黄金期货'),
    ('XAUT', 'commodity', 'XAUT作为大宗商品'),
]

print("=" * 60)
print("价格获取测试（更新后）")
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
    
    rate3 = PriceFetcher.get_exchange_rate('HKD', 'CNY')
    print(f"HKD -> CNY: {rate3:.4f}")
except Exception as e:
    print(f"  ❌ 错误: {str(e)}")

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
