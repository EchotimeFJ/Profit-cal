import sys
sys.path.insert(0, '/Users/frankjia/project/Profit_Cal/backend')

from services.price_fetcher import PriceFetcher
import requests

print("=" * 60)
print("港股和原油额外测试")
print("=" * 60)

# 测试腾讯港股，尝试不同代码格式
print("\n腾讯港股各种代码格式测试:")
print("-" * 40)
test_codes = [
    ('0700.HK', 'hk_stock', '0700.HK'),
    ('00700.HK', 'hk_stock', '00700.HK'),
    ('700', 'hk_stock', '700'),
]

for code, asset_type, name in test_codes:
    try:
        result = PriceFetcher.get_price(code, asset_type)
        if result:
            print(f"  ✅ {name}: {result['currency']} {result['current_price']:.2f}")
        else:
            print(f"  ❌ {name}: 无法获取")
    except Exception as e:
        print(f"  ❌ {name}: {str(e)}")

# 尝试获取原油数据的备选方案
print("\n原油替代方案测试:")
print("-" * 40)

try:
    # 尝试CoinGecko上的原油相关代币
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        'ids': 'usd-coin,ethereum,tether',
        'vs_currencies': 'usd',
    }
    response = requests.get(url, params=params, timeout=10)
    print(f"  CoinGecko API连接: {'✅ 成功' if response.status_code == 200 else '❌ 失败'}")
except Exception as e:
    print(f"  CoinGecko API测试: ❌ {e}")

try:
    # 直接测试Tushare API
    url = 'https://api.tushare.pro'
    params = {
        'api_name': 'daily',
        'token': '1f9795bd5527f378fad5de76a6cb678bb9b6cbb9a858437c662a2236',
        'params': {'ts_code': '00700.HK', 'start_date': '20260501', 'end_date': '20260606'},
        'fields': '',
    }
    
    response = requests.post(url, json=params, timeout=30)
    print(f"\nTushare API直接调用测试:")
    print(f"  状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  响应: {data}")
except Exception as e:
    print(f"\nTushare API错误: {e}")

print("\n" + "=" * 60)
print("额外测试完成")
print("=" * 60)
