import requests
from datetime import datetime, timedelta
import time
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()

class PriceFetcher:
    _rate_limit_last_request = {}
    _rate_limit_delay = 0.1  # 请求间隔（秒）
    _tushare_token = os.getenv("TUSHARE_TOKEN", "")
    _fx_cache = {}
    _fx_cache_ttl = 60 * 30
    _headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://finance.qq.com/",
    }

    @staticmethod
    def _price_result(current_price, previous_close, currency, source, quote_time=None, name=None):
        return {
            'current_price': float(current_price),
            'previous_close': float(previous_close) if previous_close else float(current_price),
            'currency': currency,
            'source': source,
            'quote_time': quote_time,
            'name': name,
        }

    @staticmethod
    def _request_text(url, *, encoding='gbk', timeout=6):
        response = requests.get(url, headers=PriceFetcher._headers, timeout=timeout)
        if response.status_code != 200:
            return None
        response.encoding = encoding
        return response.text

    @staticmethod
    def _request_json(url, *, params=None, timeout=6):
        response = requests.get(url, params=params, headers=PriceFetcher._headers, timeout=timeout)
        if response.status_code != 200:
            return None
        return response.json()

    @staticmethod
    def _extract_quoted_payload(text):
        if not text or '"' not in text:
            return None
        parts = text.split('"')
        return parts[1] if len(parts) >= 2 else None

    @staticmethod
    def _format_quote_time(date_str=None, time_str=None):
        if date_str and time_str:
            return f"{date_str} {time_str}"
        return date_str or time_str
    
    @staticmethod
    def _call_tushare_api(api_name, **kwargs):
        """直接调用Tushare API"""
        if not PriceFetcher._tushare_token:
            print("Tushare API未配置: 缺少 TUSHARE_TOKEN")
            return None

        try:
            url = 'https://api.tushare.pro'
            params = {
                'api_name': api_name,
                'token': PriceFetcher._tushare_token,
                'params': kwargs,
                'fields': '',
            }
            
            response = requests.post(url, json=params, timeout=30)
            if response.status_code == 200:
                data = response.json()
                if data.get('code') == 0:
                    return data.get('data')
                else:
                    print(f"Tushare API错误: {data.get('msg')}")
                    return None
            return None
        except Exception as e:
            print(f"Tushare API调用失败: {e}")
            return None
    
    @staticmethod
    def _rate_limit_check(symbol):
        """简单的速率限制"""
        current_time = time.time()
        if symbol in PriceFetcher._rate_limit_last_request:
            time_since_last = current_time - PriceFetcher._rate_limit_last_request[symbol]
            if time_since_last < PriceFetcher._rate_limit_delay:
                time.sleep(PriceFetcher._rate_limit_delay - time_since_last)
        PriceFetcher._rate_limit_last_request[symbol] = current_time
    
    @staticmethod
    def get_stock_price(symbol, asset_type):
        """获取股票价格"""
        if asset_type == 'a_stock':
            return PriceFetcher._get_a_stock(symbol)
        elif asset_type == 'hk_stock':
            return PriceFetcher._get_hk_stock(symbol)
        elif asset_type == 'us_stock':
            return PriceFetcher._get_us_stock(symbol)
        
        return None
    
    @staticmethod
    def _get_a_stock(symbol):
        """获取A股价格 - 腾讯实时行情，Tushare日线兜底"""
        PriceFetcher._rate_limit_check(symbol)

        result = PriceFetcher._get_tencent_stock(symbol, 'a_stock')
        if result:
            return result

        return PriceFetcher._get_a_stock_tushare(symbol)

    @staticmethod
    def _get_a_stock_tushare(symbol):
        """获取A股日线兜底价格 - 非实时"""
        
        try:
            end_date = datetime.now().strftime('%Y%m%d')
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y%m%d')
            
            data = PriceFetcher._call_tushare_api(
                'daily', 
                ts_code=symbol, 
                start_date=start_date, 
                end_date=end_date
            )
            
            if data and 'items' in data and len(data['items']) > 0:
                items = data['items']
                
                items_sorted = sorted(items, key=lambda x: x[1], reverse=True)
                
                if len(items_sorted) > 0:
                    current_price = float(items_sorted[0][5])
                    previous_close = float(items_sorted[1][5]) if len(items_sorted) > 1 else current_price
                    
                    return {
                        'current_price': current_price,
                        'previous_close': previous_close,
                        'currency': 'CNY',
                        'source': 'tushare_daily',
                        'quote_time': items_sorted[0][1] if len(items_sorted[0]) > 1 else None,
                    }
        except Exception as e:
            print(f"A股获取失败: {e}")
        
        return None
    
    @staticmethod
    def _get_us_stock(symbol):
        """获取美股价格 - 腾讯实时/延迟行情"""
        PriceFetcher._rate_limit_check(symbol)
        return PriceFetcher._get_tencent_stock(symbol, 'us_stock')
    
    @staticmethod
    def _get_hk_stock(symbol):
        """获取港股价格 - 腾讯实时行情"""
        PriceFetcher._rate_limit_check(symbol)
        return PriceFetcher._get_tencent_stock(symbol, 'hk_stock')

    @staticmethod
    def _to_tencent_stock_symbol(symbol, asset_type):
        raw = symbol.strip().upper()
        code = raw.split('.')[0]

        if asset_type == 'a_stock':
            if raw.endswith(('.SZ', '.XSHE')) or code.startswith(('00', '30', '15', '16', '18')):
                return f"sz{code}"
            if raw.endswith(('.SS', '.SH', '.XSHG')) or code.startswith(('50', '51', '52', '56', '58', '60', '68', '90')):
                return f"sh{code}"
            return raw.lower()

        if asset_type == 'hk_stock':
            hk_code = code.zfill(5)
            return f"hk{hk_code}"

        if asset_type == 'us_stock':
            return f"us{code}"

        return raw

    @staticmethod
    def _get_tencent_stock(symbol, asset_type):
        tencent_symbol = PriceFetcher._to_tencent_stock_symbol(symbol, asset_type)
        url = f"https://qt.gtimg.cn/q={tencent_symbol}"

        try:
            text = PriceFetcher._request_text(url)
            payload = PriceFetcher._extract_quoted_payload(text)
            if not payload:
                return None

            fields = payload.split('~')
            if len(fields) < 32 or fields[0] == 'pv_none_match':
                return None

            current_price = float(fields[3])
            previous_close = float(fields[4]) if fields[4] else current_price
            quote_time = fields[30] if len(fields) > 30 else None

            currency = {
                'a_stock': 'CNY',
                'hk_stock': 'HKD',
                'us_stock': 'USD',
            }.get(asset_type, 'USD')

            return PriceFetcher._price_result(
                current_price,
                previous_close,
                currency,
                'tencent',
                quote_time=quote_time,
                name=fields[1] if len(fields) > 1 else None,
            )
        except Exception as e:
            print(f"腾讯行情获取失败 {symbol}: {e}")
            return None
    
    @staticmethod
    def get_crypto_price(symbol):
        """获取加密货币价格"""
        # 首先尝试 Gate.io API
        try:
            PriceFetcher._rate_limit_check('gateio_' + symbol)
            url = "https://api.gateio.ws/api/v4/spot/tickers"
            params = {'currency_pair': symbol.upper() + '_USDT'}
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    ticker_data = data[0]
                    current_price = float(ticker_data['last'])
                    change_percent = float(ticker_data.get('change_percentage') or 0)
                    previous_close = current_price / (1 + change_percent / 100) if change_percent != 0 else current_price

                    return PriceFetcher._price_result(
                        current_price,
                        previous_close,
                        'USD',
                        'gateio',
                        quote_time=datetime.utcnow().isoformat() + 'Z',
                    )
        except Exception as e:
            print(f"Gate.io失败 {symbol}: {e}")
        
        # 备用: CoinGecko API
        try:
            return PriceFetcher._get_crypto_coingecko(symbol)
        except Exception as e:
            print(f"CoinGecko也失败 {symbol}: {e}")
            return None
    
    @staticmethod
    def _get_crypto_coingecko(symbol):
        """使用 CoinGecko API获取加密货币价格"""
        coin_ids = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'BNB': 'binancecoin',
            'SOL': 'solana',
            'XRP': 'ripple',
            'ADA': 'cardano',
            'DOGE': 'dogecoin',
            'DOT': 'polkadot',
            'AVAX': 'avalanche-2',
            'MATIC': 'matic-network',
            'XAUT': 'tether-gold',
        }
        
        coin_id = coin_ids.get(symbol.upper(), symbol.lower())
        
        try:
            url = "https://api.coingecko.com/api/v3/simple/price"
            params = {
                'ids': coin_id,
                'vs_currencies': 'usd',
                'include_24hr_change': 'true'
            }
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if coin_id in data:
                    current_price = float(data[coin_id]['usd'])
                    change_24hr = data[coin_id].get('usd_24hr_change', 0)
                    previous_close = current_price / (1 + change_24hr / 100) if change_24hr != 0 else current_price
                    
                    return {
                        'current_price': current_price,
                        'previous_close': previous_close,
                        'currency': 'USD',
                        'source': 'coingecko',
                        'quote_time': datetime.utcnow().isoformat() + 'Z',
                    }
        except Exception as e:
            print(f"CoinGecko API错误 {symbol}: {e}")
        
        return None
    
    @staticmethod
    def get_commodity_price(symbol):
        """获取大宗商品价格 - 腾讯/新浪环球期货实时行情"""
        PriceFetcher._rate_limit_check('commodity_' + symbol)

        try:
            result = PriceFetcher._get_tencent_commodity(symbol)
            if result:
                return result
        except Exception as e:
            print(f"腾讯大宗商品获取失败 {symbol}: {e}")

        try:
            result = PriceFetcher._get_sina_commodity(symbol)
            if result:
                return result
        except Exception as e:
            print(f"新浪大宗商品获取失败 {symbol}: {e}")
        
        return None

    @staticmethod
    def _to_global_future_symbol(symbol):
        normalized = symbol.strip().upper()
        symbol_map = {
            'GC=F': 'GC',
            'XAU=X': 'XAU',
            'XAU': 'XAU',
            'GLD': 'XAU',
            'SI=F': 'SI',
            'XAG=X': 'XAG',
            'XAG': 'XAG',
            'CL=F': 'CL',
            'BZ=F': 'OIL',
            'NG=F': 'NG',
            'HG=F': 'HG',
        }
        return symbol_map.get(normalized, normalized.replace('=F', ''))

    @staticmethod
    def _get_tencent_commodity(symbol):
        code = PriceFetcher._to_global_future_symbol(symbol)
        tencent_symbol = f"hf_{code}"
        url = f"https://qt.gtimg.cn/q={tencent_symbol}"
        text = PriceFetcher._request_text(url)
        payload = PriceFetcher._extract_quoted_payload(text)
        if not payload:
            return None

        fields = payload.split(',')
        if len(fields) < 14:
            return None

        current_price = float(fields[0])
        previous_close = float(fields[7]) if fields[7] else current_price
        quote_time = PriceFetcher._format_quote_time(fields[12], fields[6])

        return PriceFetcher._price_result(
            current_price,
            previous_close,
            'USD',
            'tencent_hf',
            quote_time=quote_time,
            name=fields[13] if len(fields) > 13 else None,
        )

    @staticmethod
    def _get_sina_commodity(symbol):
        code = PriceFetcher._to_global_future_symbol(symbol)
        sina_symbol = f"hf_{code}"
        url = f"https://hq.sinajs.cn/list={sina_symbol}"
        text = PriceFetcher._request_text(
            url,
            encoding='gbk',
            timeout=6,
        )
        payload = PriceFetcher._extract_quoted_payload(text)
        if not payload:
            return None

        fields = payload.split(',')
        if len(fields) < 15:
            return None

        current_price = float(fields[0])
        previous_close = float(fields[7]) if fields[7] else current_price
        quote_time = PriceFetcher._format_quote_time(fields[12], fields[6])

        return PriceFetcher._price_result(
            current_price,
            previous_close,
            'USD',
            'sina_hf',
            quote_time=quote_time,
            name=fields[13] if len(fields) > 13 else None,
        )

    @staticmethod
    def search_tencent_stocks(query, *, limit=10):
        """腾讯智能搜索，支持 A股/港股/美股名称和代码模糊匹配。"""
        if not query:
            return []

        try:
            url = 'https://smartbox.gtimg.cn/s3/'
            response = requests.get(
                url,
                params={'q': query, 't': 'all'},
                headers=PriceFetcher._headers,
                timeout=6,
            )
            if response.status_code != 200:
                return []
            response.encoding = 'utf-8'
            payload = PriceFetcher._extract_quoted_payload(response.text)
            if not payload:
                return []
            if '\\u' in payload:
                payload = payload.encode('utf-8').decode('unicode_escape')

            results = []
            for item in payload.split('^'):
                fields = item.split('~')
                if len(fields) < 5:
                    continue

                market, code, name, _, category = fields[:5]
                if not category.startswith('GP'):
                    continue

                market = market.lower()
                if market in ('sh', 'sz'):
                    result_type = 'a_stock'
                    symbol = f"{code}.{'SS' if market == 'sh' else 'SZ'}"
                    currency = 'CNY'
                elif market == 'hk':
                    result_type = 'hk_stock'
                    symbol = f"{code.zfill(5)}.HK"
                    currency = 'HKD'
                elif market == 'us':
                    result_type = 'us_stock'
                    symbol = code.split('.')[0].upper()
                    currency = 'USD'
                else:
                    continue

                results.append({
                    'symbol': symbol,
                    'name': name,
                    'type': result_type,
                    'currency': currency,
                })
                if len(results) >= limit:
                    break

            return results
        except Exception as e:
            print(f"腾讯搜索失败 {query}: {e}")
            return []

    @staticmethod
    def search_otc_funds(query, *, limit=10):
        """东方财富/天天基金搜索，支持场外基金代码和名称模糊匹配。"""
        if not query:
            return []

        try:
            url = 'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx'
            data = PriceFetcher._request_json(
                url,
                params={'m': 1, 'key': query},
                timeout=8,
            )
            if not data or data.get('ErrCode') != 0:
                return []

            results = []
            for item in data.get('Datas', []):
                fund_info = item.get('FundBaseInfo') or {}
                if item.get('CATEGORYDESC') != '基金' and not fund_info:
                    continue
                code = item.get('CODE') or item.get('FCODE')
                name = item.get('NAME') or item.get('SHORTNAME')
                if fund_info.get('SHORTNAME'):
                    name = fund_info['SHORTNAME']
                if not code or not name:
                    continue

                results.append({
                    'symbol': str(code),
                    'name': name,
                    'type': 'otc_fund',
                    'currency': 'CNY',
                })
                if len(results) >= limit:
                    break

            return results
        except Exception as e:
            print(f"场外基金搜索失败 {query}: {e}")
            return []

    @staticmethod
    def get_otc_fund_price(symbol):
        """获取场外基金净值/估算净值。优先天天基金盘中估算，失败时用历史单位净值。"""
        code = symbol.strip().upper()
        if not re.fullmatch(r'\d{6}', code):
            return None

        PriceFetcher._rate_limit_check('otc_fund_' + code)

        try:
            url = f'https://fundgz.1234567.com.cn/js/{code}.js'
            response = requests.get(
                url,
                params={'rt': int(time.time() * 1000)},
                headers={**PriceFetcher._headers, 'Referer': 'https://fund.eastmoney.com/'},
                timeout=8,
            )
            if response.status_code == 200:
                response.encoding = 'utf-8'
                match = re.search(r'jsonpgz\((.*)\);?', response.text)
                if match:
                    data = json.loads(match.group(1))
                    nav = float(data.get('dwjz') or 0)
                    estimate = float(data.get('gsz') or nav)
                    current_price = estimate or nav
                    if current_price:
                        return PriceFetcher._price_result(
                            current_price,
                            nav or current_price,
                            'CNY',
                            'eastmoney_fund_estimate',
                            quote_time=data.get('gztime') or data.get('jzrq'),
                            name=data.get('name'),
                        )
        except Exception as e:
            print(f"场外基金估值获取失败 {code}: {e}")

        try:
            url = f'https://fund.eastmoney.com/pingzhongdata/{code}.js'
            response = requests.get(
                url,
                headers={**PriceFetcher._headers, 'Referer': 'https://fund.eastmoney.com/'},
                timeout=8,
            )
            if response.status_code == 200:
                response.encoding = 'utf-8'
                text = response.text
                name_match = re.search(r'var fS_name = "([^"]+)";', text)
                trend_match = re.search(r'var Data_netWorthTrend = (\[.*?\]);', text)
                if trend_match:
                    trend = json.loads(trend_match.group(1))
                    if trend:
                        latest = trend[-1]
                        previous = trend[-2] if len(trend) > 1 else latest
                        return PriceFetcher._price_result(
                            latest.get('y'),
                            previous.get('y'),
                            'CNY',
                            'eastmoney_fund_nav',
                            quote_time=datetime.fromtimestamp(latest.get('x') / 1000).strftime('%Y-%m-%d') if latest.get('x') else None,
                            name=name_match.group(1) if name_match else code,
                        )
        except Exception as e:
            print(f"场外基金净值获取失败 {code}: {e}")

        return None
    
    @staticmethod
    def get_price(symbol, asset_type):
        """统一获取价格的主函数"""
        if asset_type == 'a_stock':
            return PriceFetcher._get_a_stock(symbol)
        elif asset_type == 'hk_stock':
            return PriceFetcher._get_hk_stock(symbol)
        elif asset_type == 'us_stock':
            return PriceFetcher._get_us_stock(symbol)
        elif asset_type == 'crypto':
            return PriceFetcher.get_crypto_price(symbol)
        elif asset_type == 'commodity':
            return PriceFetcher.get_commodity_price(symbol)
        elif asset_type == 'otc_fund':
            return PriceFetcher.get_otc_fund_price(symbol)
        else:
            return None
    
    @staticmethod
    def get_exchange_rate(from_currency, to_currency):
        """获取 CNY/HKD/USD 汇率，优先实时接口，失败时兜底。"""
        from_currency = (from_currency or '').upper()
        to_currency = (to_currency or '').upper()

        if from_currency == to_currency:
            return 1.0

        default_rates = {
            ('USD', 'CNY'): 7.24,
            ('CNY', 'USD'): 0.138,
            ('USD', 'HKD'): 7.82,
            ('HKD', 'USD'): 0.128,
            ('HKD', 'CNY'): 0.92,
            ('CNY', 'HKD'): 1.09,
            ('USDT', 'USD'): 1.0,
            ('USD', 'USDT'): 1.0,
            ('USDT', 'CNY'): 7.24,
            ('CNY', 'USDT'): 0.138,
            ('USDT', 'HKD'): 7.82,
            ('HKD', 'USDT'): 0.128,
        }

        cache_key = (from_currency, to_currency)
        cached = PriceFetcher._fx_cache.get(cache_key)
        if cached and time.time() - cached['time'] < PriceFetcher._fx_cache_ttl:
            return cached['rate']

        try:
            url = 'https://api.frankfurter.app/latest'
            response = requests.get(
                url,
                params={'from': from_currency, 'to': to_currency},
                timeout=6,
            )
            if response.status_code == 200:
                data = response.json()
                rate = data.get('rates', {}).get(to_currency)
                if rate:
                    rate = float(rate)
                    PriceFetcher._fx_cache[cache_key] = {'rate': rate, 'time': time.time()}
                    return rate
        except Exception as e:
            print(f"汇率获取失败 {from_currency}->{to_currency}: {e}")

        return default_rates.get(cache_key, 1.0)
