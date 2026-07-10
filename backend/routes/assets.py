import math
import logging

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from db import db
from models import Asset, Alert, PortfolioSnapshot, TradeRecord
from services.currency_rules import currency_for_asset_type
from services.price_fetcher import PriceFetcher

assets_bp = Blueprint('assets', __name__, url_prefix='/api/assets')
logger = logging.getLogger(__name__)

def _current_user_id():
    return int(get_jwt_identity())

def _to_float(value, default=None):
    if value in [None, '']:
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(parsed):
        return default
    return parsed


def _get_json_object():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def _invalidate_portfolio_snapshots(user_id):
    PortfolioSnapshot.query.filter_by(user_id=user_id).delete()

def _record_trade(asset, action, price, quantity, *, cost_basis=None, realized_profit=None, realized_profit_percent=None):
    return TradeRecord(
        user_id=asset.user_id,
        asset_id=asset.id,
        action=action,
        asset_name=asset.name,
        symbol=asset.symbol,
        asset_type=asset.asset_type,
        price=price,
        quantity=quantity,
        amount=price * quantity,
        currency=asset.currency,
        cost_basis=cost_basis,
        realized_profit=realized_profit,
        realized_profit_percent=realized_profit_percent,
    )


def _safe_price_number(value):
    if value in [None, '']:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed):
        return None
    return parsed


def _asset_detail_price_payload(asset, raw_price_data, error=None):
    price_payload = {
        'current_price': None,
        'previous_close': None,
        'currency': asset.currency,
        'source': None,
        'quote_time': None,
        'error': error,
    }
    if not isinstance(raw_price_data, dict):
        return None, price_payload

    current_price = _safe_price_number(raw_price_data.get('current_price'))
    previous_close = _safe_price_number(raw_price_data.get('previous_close'))
    price_payload.update({
        'current_price': current_price,
        'previous_close': previous_close,
        'currency': raw_price_data.get('currency'),
        'source': raw_price_data.get('source'),
        'quote_time': raw_price_data.get('quote_time'),
    })

    normalized_price_data = {
        **raw_price_data,
        'current_price': current_price,
        'previous_close': previous_close,
    }
    if raw_price_data.get('currency') != asset.currency:
        price_payload['error'] = '价格币种与资产币种不一致，暂不计算收益'
    elif raw_price_data.get('current_price') is not None and current_price is None:
        price_payload['error'] = '价格数据异常，暂不计算收益'
        normalized_price_data = None
    return normalized_price_data, price_payload


def _asset_detail_performance(asset, price_data, records):
    realized_profit = sum(record.realized_profit or 0 for record in records if record.action == 'sell')
    realized_cost = sum(record.cost_basis or 0 for record in records if record.action == 'sell')
    realized_profit_percent = (realized_profit / realized_cost * 100) if realized_cost > 0 else None
    investment = asset.buy_price * asset.quantity

    if not price_data:
        return {
            'investment': investment,
            'current_value': None,
            'unrealized_profit': None,
            'unrealized_profit_percent': None,
            'daily_profit': None,
            'daily_profit_percent': None,
            'realized_profit': realized_profit,
            'realized_profit_percent': realized_profit_percent,
        }

    current_price = price_data.get('current_price')
    previous_close = price_data.get('previous_close')
    if price_data.get('currency') != asset.currency or current_price is None:
        return {
            'investment': investment,
            'current_value': None,
            'unrealized_profit': None,
            'unrealized_profit_percent': None,
            'daily_profit': None,
            'daily_profit_percent': None,
            'realized_profit': realized_profit,
            'realized_profit_percent': realized_profit_percent,
        }

    current_value = current_price * asset.quantity
    unrealized_profit = current_value - investment
    daily_profit = (current_price - previous_close) * asset.quantity if previous_close is not None else None
    daily_profit_percent = ((current_price - previous_close) / previous_close * 100) if previous_close and previous_close > 0 else None
    return {
        'investment': investment,
        'current_value': current_value,
        'unrealized_profit': unrealized_profit,
        'unrealized_profit_percent': (unrealized_profit / investment * 100) if investment > 0 else None,
        'daily_profit': daily_profit,
        'daily_profit_percent': daily_profit_percent,
        'realized_profit': realized_profit,
        'realized_profit_percent': realized_profit_percent,
    }


@assets_bp.route('', methods=['GET'])
@jwt_required()
def get_assets():
    user_id = _current_user_id()
    assets = Asset.query.filter_by(user_id=user_id).all()
    changed = False
    for asset in assets:
        expected_currency = currency_for_asset_type(asset.asset_type)
        if asset.currency != expected_currency:
            asset.currency = expected_currency
            changed = True
    if changed:
        db.session.commit()
    return jsonify({'assets': [asset.to_dict() for asset in assets]})

@assets_bp.route('', methods=['POST'])
@jwt_required()
def create_asset():
    user_id = _current_user_id()
    data = _get_json_object()
    if data is None:
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400
    
    required_fields = ['name', 'symbol', 'asset_type', 'buy_price']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '请填写资产名称、代码、类型和买入价'}), 400
    
    if 'quantity' not in data and 'amount' not in data:
        return jsonify({'error': '请填写数量或投入金额'}), 400
    
    buy_price = _to_float(data.get('buy_price'))
    amount = _to_float(data.get('amount'))
    quantity = _to_float(data.get('quantity'))
    if not buy_price or buy_price <= 0:
        return jsonify({'error': '买入价必须大于 0'}), 400

    if not quantity and amount:
        quantity = amount / buy_price

    if not quantity or quantity <= 0:
        return jsonify({'error': '数量或投入金额必须大于 0'}), 400
    
    asset = Asset(
        user_id=user_id,
        name=data['name'],
        symbol=data['symbol'],
        asset_type=data['asset_type'],
        buy_price=buy_price,
        quantity=quantity,
        currency=currency_for_asset_type(data['asset_type'])
    )
    
    db.session.add(asset)
    db.session.flush()
    db.session.add(_record_trade(
        asset,
        'buy',
        buy_price,
        quantity,
        cost_basis=buy_price * quantity,
    ))
    _invalidate_portfolio_snapshots(user_id)
    db.session.commit()
    logger.info("assets.create.success user_id=%s asset_id=%s", user_id, asset.id)
    
    return jsonify({
        'message': '资产已添加',
        'asset': asset.to_dict()
    }), 201

@assets_bp.route('/history', methods=['GET'])
@jwt_required()
def get_trade_history():
    user_id = _current_user_id()
    assets = Asset.query.filter_by(user_id=user_id).all()
    asset_ids = [asset.id for asset in assets]

    if asset_ids:
        existing_buy_asset_ids = {
            record.asset_id
            for record in TradeRecord.query
            .filter(
                TradeRecord.user_id == user_id,
                TradeRecord.action == 'buy',
                TradeRecord.asset_id.in_(asset_ids),
            )
            .all()
        }
        backfilled = False
        for asset in assets:
            if asset.id not in existing_buy_asset_ids:
                record = _record_trade(
                    asset,
                    'buy',
                    asset.buy_price,
                    asset.quantity,
                    cost_basis=asset.buy_price * asset.quantity,
                )
                record.created_at = asset.created_at
                db.session.add(record)
                backfilled = True
        if backfilled:
            db.session.commit()

    records = (
        TradeRecord.query
        .filter_by(user_id=user_id)
        .order_by(TradeRecord.created_at.desc(), TradeRecord.id.desc())
        .all()
    )
    return jsonify({'records': [record.to_dict() for record in records]})

@assets_bp.route('/<int:asset_id>', methods=['GET'])
@jwt_required()
def get_asset(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()
    
    if not asset:
        return jsonify({'error': '资产不存在'}), 404
    
    return jsonify({'asset': asset.to_dict()})


@assets_bp.route('/<int:asset_id>/detail', methods=['GET'])
@jwt_required()
def get_asset_detail(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()

    if not asset:
        return jsonify({'error': '资产不存在或已清仓'}), 404

    records = (
        TradeRecord.query
        .filter_by(user_id=user_id, asset_id=asset.id)
        .order_by(TradeRecord.created_at.desc(), TradeRecord.id.desc())
        .all()
    )
    price_error = None
    try:
        raw_price_data = PriceFetcher.get_price(asset.symbol, asset.asset_type)
    except Exception as exc:
        logger.warning(
            "assets.detail.price_fetch_failed user_id=%s asset_id=%s error=%s",
            user_id,
            asset.id,
            exc,
        )
        raw_price_data = None
        price_error = '价格获取失败，暂不计算收益'
    price_data, price_payload = _asset_detail_price_payload(asset, raw_price_data, price_error)

    return jsonify({
        'asset': asset.to_dict(),
        'price': price_payload,
        'performance': _asset_detail_performance(asset, price_data, records),
        'records': [record.to_dict() for record in records],
    })


@assets_bp.route('/<int:asset_id>', methods=['PUT'])
@jwt_required()
def update_asset(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()
    
    if not asset:
        return jsonify({'error': '资产不存在'}), 404
    
    data = _get_json_object()
    if data is None:
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400
    
    if data.get('name'):
        asset.name = data['name']
    if data.get('symbol'):
        asset.symbol = data['symbol']
    if data.get('asset_type'):
        asset.asset_type = data['asset_type']
        asset.currency = currency_for_asset_type(data['asset_type'])
    if data.get('buy_price'):
        buy_price = _to_float(data.get('buy_price'))
        if not buy_price or buy_price <= 0:
            return jsonify({'error': '买入价必须大于 0'}), 400
        asset.buy_price = buy_price
    if data.get('quantity'):
        quantity = _to_float(data.get('quantity'))
        if not quantity or quantity <= 0:
            return jsonify({'error': '数量必须大于 0'}), 400
        asset.quantity = quantity
    asset.currency = currency_for_asset_type(asset.asset_type)

    _invalidate_portfolio_snapshots(user_id)
    db.session.commit()
    logger.info("assets.update.success user_id=%s asset_id=%s", user_id, asset.id)
    
    return jsonify({
        'message': '资产已更新',
        'asset': asset.to_dict()
    })

@assets_bp.route('/<int:asset_id>/sell', methods=['POST'])
@jwt_required()
def sell_asset(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()

    if not asset:
        return jsonify({'error': '资产不存在'}), 404

    data = _get_json_object()
    if data is None:
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400
    sell_price = _to_float(data.get('sell_price'))
    amount = _to_float(data.get('amount'))
    quantity = _to_float(data.get('quantity'))

    if not sell_price or sell_price <= 0:
        return jsonify({'error': '卖出价必须大于 0'}), 400

    if not quantity and amount:
        quantity = amount / sell_price

    if not quantity or quantity <= 0:
        return jsonify({'error': '请填写卖出数量或卖出金额'}), 400

    if quantity > asset.quantity + 1e-8:
        return jsonify({'error': '卖出数量不能超过当前持仓'}), 400

    cost_basis = asset.buy_price * quantity
    proceeds = sell_price * quantity
    realized_profit = proceeds - cost_basis
    realized_profit_percent = (realized_profit / cost_basis * 100) if cost_basis > 0 else 0

    asset_closed = quantity >= asset.quantity - 1e-8

    db.session.add(_record_trade(
        asset,
        'sell',
        sell_price,
        quantity,
        cost_basis=cost_basis,
        realized_profit=realized_profit,
        realized_profit_percent=realized_profit_percent,
    ))

    if asset_closed:
        Alert.query.filter_by(asset_id=asset.id, user_id=user_id).delete()
        db.session.delete(asset)
    else:
        asset.quantity = asset.quantity - quantity

    _invalidate_portfolio_snapshots(user_id)
    db.session.commit()
    logger.info("assets.sell.success user_id=%s asset_id=%s closed=%s", user_id, asset.id, asset_closed)

    return jsonify({
        'message': '卖出记录已保存',
        'sold_quantity': quantity,
        'amount': proceeds,
        'realized_profit': realized_profit,
        'realized_profit_percent': realized_profit_percent,
        'asset_closed': asset_closed,
    })


@assets_bp.route('/<int:asset_id>/add-position', methods=['POST'])
@jwt_required()
def add_position(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()

    if not asset:
        return jsonify({'error': '资产不存在'}), 404

    data = _get_json_object()
    if data is None:
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400
    buy_price = _to_float(data.get('buy_price'))
    amount = _to_float(data.get('amount'))
    quantity = _to_float(data.get('quantity'))

    if not buy_price or buy_price <= 0:
        return jsonify({'error': '加仓价必须大于 0'}), 400

    if not quantity and amount:
        quantity = amount / buy_price

    if not quantity or quantity <= 0:
        return jsonify({'error': '请填写加仓数量或加仓金额'}), 400

    original_quantity = asset.quantity
    original_cost = asset.buy_price * original_quantity
    added_cost = buy_price * quantity
    new_quantity = original_quantity + quantity

    asset.quantity = new_quantity
    asset.buy_price = (original_cost + added_cost) / new_quantity

    db.session.add(_record_trade(
        asset,
        'buy',
        buy_price,
        quantity,
        cost_basis=added_cost,
    ))
    _invalidate_portfolio_snapshots(user_id)
    db.session.commit()
    logger.info("assets.add_position.success user_id=%s asset_id=%s", user_id, asset.id)

    return jsonify({
        'message': '加仓记录已保存',
        'added_quantity': quantity,
        'asset': asset.to_dict(),
    })

@assets_bp.route('/<int:asset_id>', methods=['DELETE'])
@jwt_required()
def delete_asset(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()
    
    if not asset:
        return jsonify({'error': '资产不存在'}), 404
    
    Alert.query.filter_by(asset_id=asset.id, user_id=user_id).delete()
    db.session.delete(asset)
    _invalidate_portfolio_snapshots(user_id)
    db.session.commit()
    logger.info("assets.delete.success user_id=%s asset_id=%s", user_id, asset_id)
    
    return jsonify({'message': '资产已删除'})
