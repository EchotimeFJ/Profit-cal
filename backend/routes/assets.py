from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from db import db
from models import Asset, Alert, TradeRecord
from services.currency_rules import currency_for_asset_type

assets_bp = Blueprint('assets', __name__, url_prefix='/api/assets')

def _current_user_id():
    return int(get_jwt_identity())

def _to_float(value, default=None):
    if value in [None, '']:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

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
    data = request.get_json()
    
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
    db.session.commit()
    
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

@assets_bp.route('/<int:asset_id>', methods=['PUT'])
@jwt_required()
def update_asset(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()
    
    if not asset:
        return jsonify({'error': '资产不存在'}), 404
    
    data = request.get_json()
    
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
    
    db.session.commit()
    
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

    data = request.get_json() or {}
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

    db.session.commit()

    return jsonify({
        'message': '卖出记录已保存',
        'sold_quantity': quantity,
        'amount': proceeds,
        'realized_profit': realized_profit,
        'realized_profit_percent': realized_profit_percent,
        'asset_closed': asset_closed,
    })

@assets_bp.route('/<int:asset_id>', methods=['DELETE'])
@jwt_required()
def delete_asset(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()
    
    if not asset:
        return jsonify({'error': '资产不存在'}), 404
    
    db.session.delete(asset)
    db.session.commit()
    
    return jsonify({'message': '资产已删除'})
