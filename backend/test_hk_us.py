import sys
sys.path.insert(0, '/Users/frankjia/project/Profit_Cal/backend')

import requests

print("=" * 60)
print("港股和美股数据源测试")
print("=" * 60)

# 测试Tushare API
print("\n1. 测试Tushare API:")
print("-" * 40)

token = "1f9795bd5527f378fad5de76a6cb678bb9b6cbb9a858437c662a2236"

# 测试港股
test_hk = [
    ('00700.HK', '腾讯'),
    ('09988.HK', '阿里巴巴'),
    ('00001.HK', '汇丰控股'),
]

for code, name in test_hk:
    try:
        params = {
            'api_name': 'daily',
            'token': token,
            'params': {'ts_code': code, 'start_date': '20260501', 'end_date': '20260606'},
            'fields': 'ts_code,trade_date,open,high,low,close,vol',
        }
        
        response = requests.post('https://api.tushare.pro', json=params, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == 0:
                items = data.get('data', {}).get('items', [])
                if items:
                    print(f"  ✅ {name} ({code}): 找到 {len(items)} 条数据")
                    print(f"     最新价格: {items[0][5] if len(items[0]) > 5 else 'N/A'}")
                else:
                    print(f"  ⚠️ {name} ({code}): 无数据")
            else:
                print(f"  ❌ {name} ({code}): {data.get('msg')}")
        else:
            print(f"  ❌ {name} ({code}): HTTP {response.status_code}")
    except Exception as e:
        print(f"  ❌ {name} ({code}): {e}")

# 测试美股
print("\n2. 测试美股:")
print("-" * 40)

test_us = [
    ('AAPL', 'Apple'),
    ('TSLA', 'Tesla'),
    ('MSFT', 'Microsoft'),
    ('GOOGL', 'Google'),
    ('AMZN', 'Amazon'),
]

for code, name in test_us:
    try:
        params = {
            'api_name': 'us_daily',
            'token': token,
            'params': {'ts_code': code, 'start_date': '20250501', 'end_date': '20260606'},
            'fields': 'ts_code,trade_date,open,high,low,close,vol',
        }
        
        response = requests.post('https://api.tushare.pro', json=params, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == 0:
                items = data.get('data', {}).get('items', [])
                if items:
                    print(f"  ✅ {name} ({code}): 找到 {len(items)} 条数据")
                    print(f"     最新价格: {items[0][5] if len(items[0]) > 5 else 'N/A'}")
                else:
                    print(f"  ⚠️ {name} ({code}): 无数据")
            else:
                print(f"  ❌ {name} ({code}): {data.get('msg')}")
        else:
            print(f"  ❌ {name} ({code}): HTTP {response.status_code}")
    except Exception as e:
        print(f"  ❌ {name} ({code}): {e}")

# 测试Yahoo Finance（可能受限）
print("\n3. 测试Yahoo Finance (美股备用):")
print("-" * 40)

try:
    import yfinance as yf
    
    for code, name in [('AAPL', 'Apple'), ('TSLA', 'Tesla')]:
        try:
            ticker = yf.Ticker(code)
            data = ticker.history(period='2d')
            if data is not None and len(data) >= 1:
                print(f"  ✅ {name} ({code}): ${data['Close'].iloc[-1]:.2f}")
            else:
                print(f"  ❌ {name} ({code}): 无数据")
        except Exception as e:
            print(f"  ❌ {name} ({code}): {str(e)[:50]}")
except Exception as e:
    print(f"  Yahoo Finance导入失败: {e}")

# 测试其他数据源
print("\n4. 测试其他美股数据源:")
print("-" * 40)

# 测试 Alpha Vantage (免费API)
print("  Alpha Vantage: 需要API密钥")
print("  Marketstack: 需要API密钥")
print("  IEX Cloud: 需要API密钥")

# 测试 Finnhub (免费层)
print("\n5. 测试Finnhub API:")
print("-" * 40)

try:
    # Finnhub有免费层，但需要注册
    # 这里测试一下连接性
    response = requests.get('https://finnhub.io/api/v1/quote', params={
        'symbol': 'AAPL',
        'token': 'demo'  # demo token有限制
    }, timeout=10)
    
    if response.status_code == 200:
        data = response.json()
        if 'c' in data:
            print(f"  ✅ Finnhub连接成功: AAPL = ${data['c']}")
        else:
            print(f"  ⚠️ Finnhub返回: {data}")
    else:
        print(f"  ❌ Finnhub: HTTP {response.status_code}")
except Exception as e:
    print(f"  ❌ Finnhub测试失败: {e}")

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
print("\n建议:")
print("1. 港股可以通过Tushare Pro获取（需要检查权限）")
print("2. 美股建议使用Tushare Pro的us_daily接口或Yahoo Finance备用")
print("3. 或者使用付费数据源如Wind、聚宽等")
