from datetime import datetime
import math
import re

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from db import db
from models import Alert, Asset, CustomAlert
from services.currency_rules import ASSET_TYPE_CURRENCY, currency_for_asset_type

alerts_bp = Blueprint('alerts', __name__, url_prefix='/api/alerts')
ALERT_TYPES = {'above', 'below', 'reach'}
NOTIFICATION_METHODS = {'browser', 'popup', 'sound', 'vibrate', 'both'}


def _current_user_id():
    return int(get_jwt_identity())


def _validate_alert_type(alert_type):
    return alert_type in ALERT_TYPES


def _validate_asset_type(asset_type):
    return asset_type in ASSET_TYPE_CURRENCY


def _validate_notification_method(notification_method):
    return notification_method in NOTIFICATION_METHODS


def _parse_target_price(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(parsed) or parsed <= 0:
        return None
    return parsed


def _get_json_object():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def _normalize_symbol(symbol, asset_type):
    raw = (symbol or '').strip().upper()
    if not raw:
        return raw

    if asset_type == 'a_stock':
        code = raw.replace('.SS', '').replace('.SZ', '')
        if re.fullmatch(r'\d{6}', code):
            if code.startswith(('00', '30', '15', '16', '18')):
                return f'{code}.SZ'
            if code.startswith(('50', '51', '52', '56', '58', '60', '68', '90')):
                return f'{code}.SS'
    elif asset_type == 'hk_stock':
        code = raw.replace('.HK', '')
        if re.fullmatch(r'\d{1,5}', code):
            return f'{code.zfill(5)}.HK'
    elif asset_type == 'otc_fund':
        code = raw.replace('.OF', '')
        if re.fullmatch(r'\d{6}', code):
            return code

    return raw


def _normalize_existing_alert(alert):
    asset = alert.asset
    return {
        'id': f'asset-{alert.id}',
        'kind': 'asset',
        'asset_id': alert.asset_id,
        'name': asset.name if asset else f'资产 {alert.asset_id}',
        'symbol': asset.symbol if asset else '',
        'asset_type': asset.asset_type if asset else '',
        'currency': asset.currency if asset else '',
        'target_price': alert.target_price,
        'alert_type': alert.alert_type,
        'is_active': alert.is_active,
        'notification_method': alert.notification_method,
        'triggered': alert.triggered,
        'triggered_at': alert.triggered_at.isoformat() if alert.triggered_at else None,
        'created_at': alert.created_at.isoformat(),
    }


def _normalize_custom_alert(alert):
    return {
        'id': f'custom-{alert.id}',
        'kind': 'manual',
        'asset_id': None,
        'name': alert.name,
        'symbol': alert.symbol,
        'asset_type': alert.asset_type,
        'currency': alert.currency,
        'target_price': alert.target_price,
        'alert_type': alert.alert_type,
        'is_active': alert.is_active,
        'notification_method': alert.notification_method,
        'triggered': alert.triggered,
        'triggered_at': alert.triggered_at.isoformat() if alert.triggered_at else None,
        'created_at': alert.created_at.isoformat(),
    }


def _resolve_alert(alert_id, user_id):
    alert_id = str(alert_id)
    if alert_id.startswith('custom-'):
        raw_id = alert_id.split('-', 1)[1]
        if not raw_id.isdigit():
            return None, None
        return 'manual', CustomAlert.query.filter_by(id=int(raw_id), user_id=user_id).first()

    raw_id = alert_id.split('-', 1)[1] if alert_id.startswith('asset-') else alert_id
    if not raw_id.isdigit():
        return None, None
    return 'asset', Alert.query.filter_by(id=int(raw_id), user_id=user_id).first()


@alerts_bp.route('', methods=['GET'])
@jwt_required()
def get_alerts():
    user_id = _current_user_id()
    asset_alerts = Alert.query.filter_by(user_id=user_id).all()
    custom_alerts = CustomAlert.query.filter_by(user_id=user_id).all()

    normalized = [
        *(_normalize_existing_alert(alert) for alert in asset_alerts),
        *(_normalize_custom_alert(alert) for alert in custom_alerts),
    ]
    normalized.sort(key=lambda item: item['created_at'], reverse=True)

    return jsonify({'alerts': normalized})


@alerts_bp.route('', methods=['POST'])
@jwt_required()
def create_alert():
    user_id = _current_user_id()
    data = _get_json_object()
    if data is None:
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400

    target_price = data.get('target_price')
    alert_type = data.get('alert_type')
    if target_price in [None, ''] or not alert_type:
        return jsonify({'error': '请填写目标价格和提醒类型'}), 400
    target_price = _parse_target_price(target_price)
    if target_price is None:
        return jsonify({'error': '目标价格必须大于 0'}), 400
    if not _validate_alert_type(alert_type):
        return jsonify({'error': '提醒类型无效'}), 400

    notification_method = data.get('notification_method', 'browser')
    if not _validate_notification_method(notification_method):
        return jsonify({'error': '提醒方式无效'}), 400

    if data.get('asset_id'):
        asset = Asset.query.filter_by(id=data['asset_id'], user_id=user_id).first()
        if not asset:
            return jsonify({'error': '资产不存在'}), 404

        alert = Alert(
            user_id=user_id,
            asset_id=asset.id,
            target_price=target_price,
            alert_type=alert_type,
            notification_method=notification_method,
        )
        db.session.add(alert)
        db.session.commit()
        return jsonify({
            'message': '提醒已添加',
            'alert': _normalize_existing_alert(alert),
        }), 201

    asset_type = data.get('asset_type')
    symbol = _normalize_symbol(data.get('symbol'), asset_type)
    if not symbol or not asset_type:
        return jsonify({'error': '请填写代码和资产类型'}), 400
    if not _validate_asset_type(asset_type):
        return jsonify({'error': '资产类型无效'}), 400

    alert = CustomAlert(
        user_id=user_id,
        name=(data.get('name') or symbol).strip(),
        symbol=symbol,
        asset_type=asset_type,
        currency=currency_for_asset_type(asset_type),
        target_price=target_price,
        alert_type=alert_type,
        notification_method=notification_method,
    )
    db.session.add(alert)
    db.session.commit()

    return jsonify({
        'message': '提醒已添加',
        'alert': _normalize_custom_alert(alert),
    }), 201


@alerts_bp.route('/<alert_id>', methods=['PUT'])
@jwt_required()
def update_alert(alert_id):
    user_id = _current_user_id()
    kind, alert = _resolve_alert(alert_id, user_id)

    if not alert:
        return jsonify({'error': '提醒不存在'}), 404

    data = _get_json_object()
    if data is None:
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400

    should_rearm = False

    if data.get('target_price') is not None:
        target_price = _parse_target_price(data['target_price'])
        if target_price is None:
            return jsonify({'error': '目标价格必须大于 0'}), 400
        alert.target_price = target_price
        should_rearm = True
    if data.get('alert_type'):
        if not _validate_alert_type(data['alert_type']):
            return jsonify({'error': '提醒类型无效'}), 400
        alert.alert_type = data['alert_type']
        should_rearm = True
    if data.get('is_active') is not None:
        alert.is_active = data['is_active']
    if data.get('notification_method'):
        if not _validate_notification_method(data['notification_method']):
            return jsonify({'error': '提醒方式无效'}), 400
        alert.notification_method = data['notification_method']
    if kind == 'asset' and data.get('asset_id') is not None:
        try:
            incoming_asset_id = int(data['asset_id'])
        except (TypeError, ValueError):
            return jsonify({'error': '资产不存在'}), 400
        if incoming_asset_id != alert.asset_id:
            return jsonify({'error': '编辑已有持仓提醒时不支持更换持仓'}), 400
    if should_rearm:
        alert.triggered = False
        alert.triggered_at = None

    if kind == 'manual':
        if data.get('name') is not None:
            alert.name = (data.get('name') or alert.symbol).strip()
        if data.get('asset_type'):
            if not _validate_asset_type(data['asset_type']):
                return jsonify({'error': '资产类型无效'}), 400
            alert.asset_type = data['asset_type']
            alert.currency = currency_for_asset_type(alert.asset_type)
            should_rearm = True
        if data.get('symbol'):
            alert.symbol = _normalize_symbol(data['symbol'], alert.asset_type)
            should_rearm = True

    if should_rearm:
        alert.triggered = False
        alert.triggered_at = None

    db.session.commit()

    return jsonify({
        'message': '提醒已更新',
        'alert': _normalize_existing_alert(alert) if kind == 'asset' else _normalize_custom_alert(alert),
    })


@alerts_bp.route('/<alert_id>', methods=['DELETE'])
@jwt_required()
def delete_alert(alert_id):
    user_id = _current_user_id()
    _, alert = _resolve_alert(alert_id, user_id)

    if not alert:
        return jsonify({'error': '提醒不存在'}), 404

    db.session.delete(alert)
    db.session.commit()

    return jsonify({'message': '提醒已删除'})
