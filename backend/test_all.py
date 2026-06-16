import sys
sys.path.insert(0, '/Users/frankjia/project/Profit_Cal/backend')

from services.price_fetcher import PriceFetcher

print("=" * 60)
print("完整资产价格测试")
print("=" * 60)

# 测试所有类型
test_cases = [
    # A股
    ('000858.SZ', 'a_stock', '五粮液'),
    ('600519.SS', 'a_stock', '贵州茅台'),
    
    # 美股
    ('AAPL', 'us_stock', 'Apple'),
    ('TSLA', 'us_stock', 'Tesla'),
    ('MSFT', 'us_stock', 'Microsoft'),
    
    # 港股
    ('0700.HK', 'hk_stock', '腾讯'),
    ('9988.HK', 'hk_stock', '阿里巴巴'),
    
    # 加密货币
    ('BTC', 'crypto', 'Bitcoin'),
    ('ETH', 'crypto', 'Ethereum'),
    ('XAUT', 'crypto', 'Tether Gold'),
    
    # 大宗商品
    ('GC=F', 'commodity', '黄金期货'),
    ('XAUT', 'commodity', 'XAUT'),
]

print("\n📊 资产价格获取:")
print("-" * 60)

success_count = 0
fail_count = 0

for symbol, asset_type, name in test_cases:
    try:
        price_data = PriceFetcher.get_price(symbol, asset_type)
        
        if price_data:
            success_count += 1
            print(f"✅ {name:15s} ({symbol:10s}): {price_data['currency']} {price_data['current_price']:>12.2f}")
        else:
            fail_count += 1
            print(f"❌ {name:15s} ({symbol:10s}): 无法获取")
            
    except Exception as e:
        fail_count += 1
        print(f"❌ {name:15s} ({symbol:10s}): 错误 - {e}")

print("-" * 60)
print(f"总计: ✅ {success_count} 成功, ❌ {fail_count} 失败")

# 测试汇率
print("\n💱 汇率获取:")
print("-" * 60)
try:
    usd_to_cny = PriceFetcher.get_exchange_rate('USD', 'CNY')
    cny_to_usd = PriceFetcher.get_exchange_rate('CNY', 'USD')
    hkd_to_cny = PriceFetcher.get_exchange_rate('HKD', 'CNY')
    
    print(f"USD -> CNY: {usd_to_cny:.4f}")
    print(f"CNY -> USD: {cny_to_usd:.4f}")
    print(f"HKD -> CNY: {hkd_to_cny:.4f}")
except Exception as e:
    print(f"❌ 汇率获取失败: {e}")

print("=" * 60)
