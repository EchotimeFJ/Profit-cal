import json
from datetime import date

from db import db
from models import Asset, PortfolioHistorySnapshot, User
from routes.prices import SUPPORTED_SETTLEMENT_CURRENCIES, _build_portfolio_payload
from services.currency_rules import currency_for_asset_type
from services.price_fetcher import PriceFetcher


class _HistoryLiveAssetView:
    def __init__(self, asset):
        self.id = asset.id
        self.name = asset.name
        self.symbol = asset.symbol
        self.asset_type = asset.asset_type
        self.buy_price = asset.buy_price
        self.quantity = asset.quantity
        self.currency = currency_for_asset_type(asset.asset_type)
        self.created_at = asset.created_at
        self.updated_at = asset.updated_at

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'symbol': self.symbol,
            'asset_type': self.asset_type,
            'buy_price': self.buy_price,
            'quantity': self.quantity,
            'currency': self.currency,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }


def _baseline_payload_from_assets(user_id, settlement_currency):
    assets = Asset.query.filter_by(user_id=user_id).all()
    total_investment = 0.0
    converted_assets = []
    for asset in assets:
        amount = (asset.buy_price or 0) * (asset.quantity or 0)
        rate = PriceFetcher.get_exchange_rate(asset.currency, settlement_currency)
        converted_amount = amount * rate
        total_investment += converted_amount
        converted_assets.append({
            'asset_id': asset.id,
            'currency': asset.currency,
            'amount': amount,
            'exchange_rate': rate,
            'converted_amount': converted_amount,
        })
    payload = {
        'baseline_source': 'cost_basis',
        'asset_count': len(assets),
        'converted_assets': converted_assets,
    }
    return {
        'total_investment': total_investment,
        'total_current_value': total_investment,
        'total_profit': 0.0,
        'total_profit_percent': 0.0,
        'daily_profit': 0.0,
        'currency': settlement_currency,
        'payload': payload,
    }


def normalize_history_currency(value, user=None):
    currency = (value or getattr(user, 'preferred_currency', None) or 'CNY').upper()
    if currency not in SUPPORTED_SETTLEMENT_CURRENCIES:
        return 'CNY'
    return currency


def build_history_snapshot_payload(user, settlement_currency, *, use_live_prices=True):
    assets = Asset.query.filter_by(user_id=user.id).all()
    if use_live_prices and assets:
        try:
            live_assets = [_HistoryLiveAssetView(asset) for asset in assets]
            portfolio_payload = _build_portfolio_payload(user, live_assets, settlement_currency, 'ORIGINAL')
            summary = portfolio_payload['summary']
            return {
                'total_investment': summary['total_investment'],
                'total_current_value': summary['total_current_value'],
                'total_profit': summary['total_profit'],
                'total_profit_percent': summary['total_profit_percent'],
                'daily_profit': summary['daily_profit'],
                'currency': settlement_currency,
                'payload': {
                    'baseline_source': 'live_portfolio',
                    'asset_count': len(assets),
                },
            }
        except Exception:
            db.session.rollback()
    return _baseline_payload_from_assets(user.id, settlement_currency)


def upsert_history_snapshot(user, settlement_currency='CNY', snapshot_date=None, *, use_live_prices=True):
    snapshot_date = snapshot_date or date.today()
    settlement_currency = normalize_history_currency(settlement_currency, user)
    data = build_history_snapshot_payload(user, settlement_currency, use_live_prices=use_live_prices)
    snapshot = PortfolioHistorySnapshot.query.filter_by(
        user_id=user.id,
        snapshot_date=snapshot_date,
        settlement_currency=settlement_currency,
    ).first()
    if snapshot is None:
        snapshot = PortfolioHistorySnapshot(
            user_id=user.id,
            snapshot_date=snapshot_date,
            settlement_currency=settlement_currency,
        )
        db.session.add(snapshot)

    snapshot.total_investment = data['total_investment']
    snapshot.total_current_value = data['total_current_value']
    snapshot.total_profit = data['total_profit']
    snapshot.total_profit_percent = data['total_profit_percent']
    snapshot.daily_profit = data['daily_profit']
    snapshot.payload = json.dumps(data['payload'], ensure_ascii=False)
    return snapshot


def migrate_existing_users_history():
    migrated = 0
    for user in User.query.all():
        currency = normalize_history_currency(None, user)
        exists = PortfolioHistorySnapshot.query.filter_by(
            user_id=user.id,
            settlement_currency=currency,
        ).first()
        if exists:
            continue
        upsert_history_snapshot(user, currency, use_live_prices=True)
        migrated += 1
    db.session.commit()
    return migrated
