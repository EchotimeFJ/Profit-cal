from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from db import db
from models import Asset, Alert, User
from services.price_fetcher import PriceFetcher
from services.currency_rules import currency_for_asset_type
from datetime import datetime
import re

prices_bp = Blueprint('prices', __name__, url_prefix='/api/prices')
SUPPORTED_SETTLEMENT_CURRENCIES = {'CNY', 'HKD', 'USD'}

def _current_user_id():
    return int(get_jwt_identity())

@prices_bp.route('/portfolio', methods=['GET'])
@jwt_required()
def get_portfolio_prices():
    user_id = _current_user_id()
    user = User.query.get(user_id)
    assets = Asset.query.filter_by(user_id=user_id).all()
    
    target_currency = (request.args.get('currency') or user.preferred_currency or 'CNY').upper()
    if target_currency not in SUPPORTED_SETTLEMENT_CURRENCIES:
        target_currency = 'CNY'
    
    portfolio_data = []
    summary_by_currency = {}
    normalized_assets = False
    
    for asset in assets:
        expected_currency = currency_for_asset_type(asset.asset_type)
        if asset.currency != expected_currency:
            asset.currency = expected_currency
            normalized_assets = True

        price_data = PriceFetcher.get_price(asset.symbol, asset.asset_type)
        
        if price_data:
            current_price = price_data['current_price']
            previous_close = price_data['previous_close']
            price_currency = price_data['currency']
            calc_currency = expected_currency
            
            currency_mismatch = asset.currency != price_currency
            asset_investment = None
            asset_current_value = None
            asset_profit = None
            asset_profit_percent = None
            asset_daily_profit = None

            if not currency_mismatch:
                asset_investment = asset.quantity * asset.buy_price
                asset_current_value = asset.quantity * current_price
                asset_profit = asset_current_value - asset_investment
                asset_profit_percent = (asset_profit / asset_investment * 100) if asset_investment > 0 else 0
                asset_daily_profit = asset.quantity * (current_price - previous_close)

                summary = summary_by_currency.setdefault(calc_currency, {
                    'total_investment': 0.0,
                    'total_current_value': 0.0,
                    'total_profit': 0.0,
                    'total_profit_percent': 0.0,
                    'daily_profit': 0.0,
                    'currency': calc_currency
                })
                summary['total_investment'] += asset_investment
                summary['total_current_value'] += asset_current_value
                summary['total_profit'] += asset_profit
                summary['daily_profit'] += asset_daily_profit
            
            portfolio_data.append({
                **asset.to_dict(),
                'original_buy_price': asset.buy_price,
                'current_price': current_price,
                'current_price_original': current_price,
                'previous_close': previous_close,
                'profit': asset_profit,
                'profit_percent': asset_profit_percent,
                'daily_profit': asset_daily_profit,
                'currency': calc_currency,
                'asset_currency': asset.currency,
                'price_currency': price_currency,
                'investment': asset_investment,
                'current_value': asset_current_value,
                'source': price_data.get('source'),
                'quote_time': price_data.get('quote_time'),
                'currency_mismatch': currency_mismatch,
                'error': '价格币种与资产币种不一致，未启用汇率换算时暂不计算收益' if currency_mismatch else None
            })
        else:
            portfolio_data.append({
                **asset.to_dict(),
                'current_price': None,
                'profit': None,
                'profit_percent': None,
                'daily_profit': None,
                'investment': None,
                'current_value': None,
                'error': '价格获取失败'
            })

    if normalized_assets:
        db.session.commit()
    
    for summary in summary_by_currency.values():
        if summary['total_investment'] > 0:
            summary['total_profit_percent'] = (summary['total_profit'] / summary['total_investment']) * 100

    total_summary = {
        'total_investment': 0.0,
        'total_current_value': 0.0,
        'total_profit': 0.0,
        'total_profit_percent': 0.0,
        'daily_profit': 0.0,
        'currency': target_currency
    }

    exchange_rates = {}
    for source_currency, summary in summary_by_currency.items():
        rate = PriceFetcher.get_exchange_rate(source_currency, target_currency)
        exchange_rates[source_currency] = rate
        total_summary['total_investment'] += summary['total_investment'] * rate
        total_summary['total_current_value'] += summary['total_current_value'] * rate
        total_summary['total_profit'] += summary['total_profit'] * rate
        total_summary['daily_profit'] += summary['daily_profit'] * rate

    if total_summary['total_investment'] > 0:
        total_summary['total_profit_percent'] = (
            total_summary['total_profit'] / total_summary['total_investment']
        ) * 100
    
    return jsonify({
        'portfolio': portfolio_data,
        'summary': total_summary,
        'summary_by_currency': summary_by_currency,
        'settlement_currency': target_currency,
        'exchange_rates': exchange_rates,
    })

@prices_bp.route('/check-alerts', methods=['GET'])
@jwt_required()
def check_alerts():
    user_id = _current_user_id()
    assets = Asset.query.filter_by(user_id=user_id).all()
    alerts = Alert.query.filter_by(user_id=user_id, is_active=True, triggered=False).all()
    
    triggered_alerts = []
    
    for asset in assets:
        price_data = PriceFetcher.get_price(asset.symbol, asset.asset_type)
        
        if price_data:
            current_price = price_data['current_price']
            asset_alerts = [a for a in alerts if a.asset_id == asset.id]
            
            for alert in asset_alerts:
                should_trigger = False
                
                if alert.alert_type == 'above' and current_price >= alert.target_price:
                    should_trigger = True
                elif alert.alert_type == 'below' and current_price <= alert.target_price:
                    should_trigger = True
                
                if should_trigger:
                    alert.triggered = True
                    alert.triggered_at = datetime.utcnow()
                    db.session.commit()
                    
                    triggered_alerts.append({
                        **alert.to_dict(),
                        'asset': asset.to_dict(),
                        'current_price': current_price,
                        'target_price': alert.target_price
                    })
    
    return jsonify({
        'triggered_alerts': triggered_alerts
    })

@prices_bp.route('/search', methods=['GET'])
def search_assets():
    query_raw = request.args.get('q', '').strip()
    query = query_raw.upper()
    query_lower = query_raw.lower()
    asset_type = request.args.get('type', '').strip()
    
    if not query:
        return jsonify({'results': []})
    
    results = []

    searchable_assets = [
        # 美股
        {'symbol': 'AAPL', 'name': '苹果公司', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['apple', 'apple inc', 'iphone', '苹果']},
        {'symbol': 'MSFT', 'name': '微软', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['microsoft', '微软']},
        {'symbol': 'GOOGL', 'name': '谷歌A', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['alphabet', 'google', '谷歌']},
        {'symbol': 'GOOG', 'name': '谷歌C', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['alphabet', 'google', '谷歌']},
        {'symbol': 'AMZN', 'name': '亚马逊', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['amazon', '亚马逊']},
        {'symbol': 'TSLA', 'name': '特斯拉', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['tesla', '特斯拉']},
        {'symbol': 'META', 'name': 'Meta Platforms', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['facebook', 'meta', '脸书']},
        {'symbol': 'NVDA', 'name': '英伟达', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['nvidia', '英伟达', 'nv']},
        {'symbol': 'JPM', 'name': '摩根大通', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['jpmorgan', 'chase', '摩根']},
        {'symbol': 'V', 'name': 'Visa', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['visa', '维萨']},
        {'symbol': 'WMT', 'name': '沃尔玛', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['walmart', '沃尔玛']},
        {'symbol': 'PG', 'name': '宝洁', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['procter', 'gamble', '宝洁']},
        {'symbol': 'JNJ', 'name': '强生', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['johnson', '强生']},
        {'symbol': 'UNH', 'name': '联合健康', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['unitedhealth', '联合健康']},
        {'symbol': 'HD', 'name': '家得宝', 'type': 'us_stock', 'currency': 'USD', 'aliases': ['home depot', '家得宝']},

        # A股
        {'symbol': '600519.SS', 'name': '贵州茅台', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['茅台', 'maotai', '贵州茅台']},
        {'symbol': '000858.SZ', 'name': '五粮液', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['wuliangye', '五粮液']},
        {'symbol': '000001.SZ', 'name': '平安银行', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['平安银行']},
        {'symbol': '600036.SS', 'name': '招商银行', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['招行', '招商银行']},
        {'symbol': '601318.SS', 'name': '中国平安', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['平安', '中国平安']},
        {'symbol': '600900.SS', 'name': '长江电力', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['长电', '长江电力']},
        {'symbol': '000333.SZ', 'name': '美的集团', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['美的', 'midea']},
        {'symbol': '000651.SZ', 'name': '格力电器', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['格力', 'gree']},
        {'symbol': '601899.SS', 'name': '紫金矿业', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['紫金', 'zijin']},
        {'symbol': '600276.SS', 'name': '恒瑞医药', 'type': 'a_stock', 'currency': 'CNY', 'aliases': ['恒瑞', '恒瑞医药']},

        # 港股
        {'symbol': '0700.HK', 'name': '腾讯控股', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['腾讯', 'tencent']},
        {'symbol': '9988.HK', 'name': '阿里巴巴', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['阿里', 'alibaba']},
        {'symbol': '0005.HK', 'name': '汇丰控股', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['汇丰', 'hsbc']},
        {'symbol': '0001.HK', 'name': '长和', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['长江和记', '长和']},
        {'symbol': '0941.HK', 'name': '中国移动', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['中移动', '中国移动']},
        {'symbol': '3690.HK', 'name': '美团', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['meituan', '美团']},
        {'symbol': '9618.HK', 'name': '京东集团', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['京东', 'jd']},
        {'symbol': '9999.HK', 'name': '网易', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['netease', '网易']},
        {'symbol': '2318.HK', 'name': '中国平安', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['平安', '中国平安']},
        {'symbol': '0883.HK', 'name': '中国海洋石油', 'type': 'hk_stock', 'currency': 'HKD', 'aliases': ['中海油', 'cnooc']},

        # 加密货币
        {'symbol': 'BTC', 'name': '比特币', 'type': 'crypto', 'currency': 'USD', 'aliases': ['bitcoin', '比特币', '大饼']},
        {'symbol': 'ETH', 'name': '以太坊', 'type': 'crypto', 'currency': 'USD', 'aliases': ['ethereum', '以太坊']},
        {'symbol': 'BNB', 'name': 'BNB', 'type': 'crypto', 'currency': 'USD', 'aliases': ['binance coin', '币安币']},
        {'symbol': 'SOL', 'name': 'Solana', 'type': 'crypto', 'currency': 'USD', 'aliases': ['solana', '索拉纳']},
        {'symbol': 'XRP', 'name': '瑞波币', 'type': 'crypto', 'currency': 'USD', 'aliases': ['ripple', '瑞波']},
        {'symbol': 'ADA', 'name': 'Cardano', 'type': 'crypto', 'currency': 'USD', 'aliases': ['cardano', '艾达']},
        {'symbol': 'DOGE', 'name': '狗狗币', 'type': 'crypto', 'currency': 'USD', 'aliases': ['dogecoin', '狗狗币']},
        {'symbol': 'DOT', 'name': 'Polkadot', 'type': 'crypto', 'currency': 'USD', 'aliases': ['polkadot', '波卡']},
        {'symbol': 'AVAX', 'name': 'Avalanche', 'type': 'crypto', 'currency': 'USD', 'aliases': ['avalanche', '雪崩']},
        {'symbol': 'MATIC', 'name': 'Polygon', 'type': 'crypto', 'currency': 'USD', 'aliases': ['polygon', 'matic']},
        {'symbol': 'XAUT', 'name': 'Tether Gold', 'type': 'crypto', 'currency': 'USD', 'aliases': ['tether gold', 'xaut']},

        # 大宗商品
        {'symbol': 'GC=F', 'name': '纽约黄金', 'type': 'commodity', 'currency': 'USD', 'aliases': ['gold', '黄金', '纽约黄金', 'comex gold']},
        {'symbol': 'CL=F', 'name': 'WTI原油', 'type': 'commodity', 'currency': 'USD', 'aliases': ['crude oil', 'oil', '原油', '纽约原油', 'wti']},
        {'symbol': 'NG=F', 'name': '美国天然气', 'type': 'commodity', 'currency': 'USD', 'aliases': ['natural gas', '天然气', '美国天然气']},
        {'symbol': 'SI=F', 'name': '纽约白银', 'type': 'commodity', 'currency': 'USD', 'aliases': ['silver', '白银']},
        {'symbol': 'HG=F', 'name': '美铜', 'type': 'commodity', 'currency': 'USD', 'aliases': ['copper', '铜', '美铜']},
        {'symbol': 'ZC=F', 'name': '玉米', 'type': 'commodity', 'currency': 'USD', 'aliases': ['corn', '玉米']},
        {'symbol': 'ZW=F', 'name': '小麦', 'type': 'commodity', 'currency': 'USD', 'aliases': ['wheat', '小麦']},
        {'symbol': 'ZS=F', 'name': '大豆', 'type': 'commodity', 'currency': 'USD', 'aliases': ['soybean', 'soybeans', '大豆']},

    ]

    def matches(item):
        haystack = [
            item['symbol'].upper(),
            item['name'].upper(),
            item['name'].lower(),
            *(alias.upper() for alias in item.get('aliases', [])),
            *(alias.lower() for alias in item.get('aliases', [])),
        ]
        return any(query in value or query_lower in value for value in haystack)

    for item in searchable_assets:
        if asset_type not in ['', item['type']]:
            continue
        if matches(item):
            results.append({
                'symbol': item['symbol'],
                'name': item['name'],
                'type': item['type'],
                'currency': item['currency'],
            })

    def accepts_type(result_type):
        return asset_type in ['', result_type]

    def has_symbol(symbol):
        return any(item['symbol'].upper() == symbol.upper() for item in results)

    def add_search_result(item, prepend=False):
        if not accepts_type(item['type']) or has_symbol(item['symbol']):
            return
        row = {
            'symbol': item['symbol'],
            'name': item['name'],
            'type': item['type'],
            'currency': item.get('currency') or currency_for_asset_type(item['type']),
        }
        if prepend:
            results.insert(0, row)
        else:
            results.append(row)

    def add_live_result(symbol, result_type, display_symbol=None):
        display_symbol = display_symbol or symbol
        if has_symbol(display_symbol):
            return
        price_data = PriceFetcher.get_price(symbol, result_type)
        if price_data:
            results.insert(0, {
                'symbol': display_symbol,
                'name': price_data.get('name') or display_symbol,
                'type': result_type,
                'currency': price_data.get('currency') or currency_for_asset_type(result_type),
            })

    for item in PriceFetcher.search_tencent_stocks(query_raw, limit=12):
        add_search_result(item)

    if re.fullmatch(r'\d{6}', query_raw) and asset_type in ['', 'a_stock']:
        code = query_raw
        suffix = None
        if code.startswith(('00', '30', '15', '16', '18')):
            suffix = 'SZ'
        elif code.startswith(('50', '51', '52', '56', '58', '60', '68', '90')):
            suffix = 'SS'

        if suffix:
            symbol = f'{code}.{suffix}'
            add_live_result(symbol, 'a_stock')

    if re.fullmatch(r'\d{6}', query_raw) and accepts_type('otc_fund'):
        add_live_result(query_raw, 'otc_fund')

    hk_match = re.fullmatch(r'(\d{1,5})(?:\.HK)?', query, re.IGNORECASE)
    if hk_match and asset_type in ['', 'hk_stock']:
        hk_code = hk_match.group(1).zfill(5)
        add_live_result(hk_code, 'hk_stock', f'{hk_code}.HK')

    if re.fullmatch(r'[A-Z][A-Z.-]{1,9}', query) and asset_type in ['', 'us_stock']:
        add_live_result(query, 'us_stock')
    
    return jsonify({'results': results[:20]})
