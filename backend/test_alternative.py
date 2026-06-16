import sys
sys.path.insert(0, '/Users/frankjia/project/Profit_Cal/backend')

import yfinance as yf
import requests

print("=" * 60)
print("测试不同的数据源和资产代码")
print("=" * 60)

# 测试不同的港股代码格式
print("\n1. 测试港股不同代码格式:")
print("-" * 40)
hk_codes = ['0700.HK', '0700', 'TCEHY', 'Tencent']
for code in hk_codes:
    try:
        ticker = yf.Ticker(code)
        data = ticker.history(period='2d')
        if len(data) > 0:
            print(f"  ✅ {code}: ${data['Close'].iloc[-1]:.2f}")
        else:
            print(f"  ❌ {code}: 无数据")
    except Exception as e:
        print(f"  ❌ {code}: {str(e)[:50]}")

# 测试不同的A股代码格式
print("\n2. 测试A股不同代码格式:")
print("-" * 40)
cn_codes = ['000858.SZ', '000858', '600519.SS', '600519']
for code in cn_codes:
    try:
        ticker = yf.Ticker(code)
        data = ticker.history(period='2d')
        if len(data) > 0:
            print(f"  ✅ {code}: ¥{data['Close'].iloc[-1]:.2f}")
        else:
            print(f"  ❌ {code}: 无数据")
    except Exception as e:
        print(f"  ❌ {code}: {str(e)[:50]}")

# 测试大宗商品
print("\n3. 测试大宗商品:")
print("-" * 40)
commodity_codes = ['CL=F', 'GC=F', 'SI=F', 'NG=F', 'USO', 'USOI', 'GLD', 'IAU', 'DBC']
for code in commodity_codes:
    try:
        ticker = yf.Ticker(code)
        data = ticker.history(period='2d')
        if len(data) > 0:
            print(f"  ✅ {code}: ${data['Close'].iloc[-1]:.2f}")
        else:
            print(f"  ❌ {code}: 无数据")
    except Exception as e:
        print(f"  ❌ {code}: {str(e)[:50]}")

# 测试 Gate.io API
print("\n4. 测试 Gate.io API:")
print("-" * 40)
try:
    url = "https://api.gateio.ws/api/v4/spot/tickers"
    params = {'currency_pair': 'XAU_USDT'}
    response = requests.get(url, params=params, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data and len(data) > 0:
            print(f"  ✅ XAU_USDT: ${float(data[0]['last']):.2f}")
        else:
            print(f"  ❌ XAU_USDT: 无数据")
    else:
        print(f"  ❌ Gate.io: HTTP {response.status_code}")
except Exception as e:
    print(f"  ❌ Gate.io: {str(e)[:50]}")

try:
    url = "https://api.gateio.ws/api/v4/spot/tickers"
    params = {'currency_pair': 'OIL_USDT'}
    response = requests.get(url, params=params, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if data and len(data) > 0:
            print(f"  ✅ OIL_USDT: ${float(data[0]['last']):.2f}")
        else:
            print(f"  ❌ OIL_USDT: 无数据")
    else:
        print(f"  ❌ Gate.io: HTTP {response.status_code}")
except Exception as e:
    print(f"  ❌ Gate.io: {str(e)[:50]}")

# 测试 CoinGecko API
print("\n5. 测试 CoinGecko API (替代数据源):")
print("-" * 40)
try:
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        'ids': 'bitcoin,tencent,tether-gold',
        'vs_currencies': 'usd',
        'include_24hr_change': 'true'
    }
    response = requests.get(url, params=params, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if 'bitcoin' in data:
            print(f"  ✅ BTC: ${data['bitcoin']['usd']:.2f} (24h: {data['bitcoin']['usd_24h_change']:+.2f}%)")
        if 'tether-gold' in data:
            print(f"  ✅ XAUT (Tether Gold): ${data['tether-gold']['usd']:.2f}")
        if 'tencent' not in data:
            print(f"  ℹ️  CoinGecko 不支持腾讯股票")
    else:
        print(f"  ❌ CoinGecko: HTTP {response.status_code}")
except Exception as e:
    print(f"  ❌ CoinGecko: {str(e)[:50]}")

# 测试 Alpha Vantage (免费股票API)
print("\n6. 测试 Yahoo Finance 直接接口:")
print("-" * 40)
test_stocks = [
    ('AAPL', 'Apple'),
    ('MSFT', 'Microsoft'),
    ('TSLA', 'Tesla'),
    ('0700.HK', '腾讯'),
    ('9988.HK', '阿里巴巴'),
]

for symbol, name in test_stocks:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        if 'currentPrice' in info:
            print(f"  ✅ {symbol} ({name}): ${info['currentPrice']:.2f}")
        elif 'regularMarketPrice' in info:
            print(f"  ✅ {symbol} ({name}): ${info['regularMarketPrice']:.2f}")
        else:
            print(f"  ⚠️ {symbol}: 无价格信息")
    except Exception as e:
        print(f"  ❌ {symbol}: {str(e)[:50]}")
