from collections import defaultdict

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import TradeRecord


analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')


def _current_user_id():
    return int(get_jwt_identity())


def _safe_sum(values):
    return sum(value for value in values if value is not None)


def _round_or_none(value):
    if value is None:
        return None
    return round(value, 4)


def _record_to_dict(record):
    return {
        'id': record.id,
        'user_id': record.user_id,
        'asset_id': record.asset_id,
        'action': record.action,
        'asset_name': record.asset_name,
        'symbol': record.symbol,
        'asset_type': record.asset_type,
        'price': record.price,
        'quantity': record.quantity,
        'amount': record.amount,
        'currency': record.currency,
        'cost_basis': record.cost_basis,
        'realized_profit': record.realized_profit,
        'realized_profit_percent': record.realized_profit_percent,
        'created_at': record.created_at.isoformat(),
    }


def _build_closed_position(asset_id, records):
    buy_records = [record for record in records if record.action == 'buy']
    sell_records = [record for record in records if record.action == 'sell']
    if not buy_records or not sell_records:
        return None

    buy_quantity = _safe_sum(record.quantity for record in buy_records)
    sell_quantity = _safe_sum(record.quantity for record in sell_records)
    if sell_quantity < buy_quantity:
        return None

    ordered_records = sorted(records, key=lambda record: (record.created_at, record.id or 0))
    first_buy_at = min(record.created_at for record in buy_records)
    closed_at = max(record.created_at for record in sell_records)
    holding_days = max((closed_at.date() - first_buy_at.date()).days, 0)

    cost_basis_values = [record.cost_basis for record in sell_records if record.cost_basis is not None]
    total_cost = _safe_sum(cost_basis_values) if cost_basis_values else _safe_sum(record.amount for record in buy_records)
    total_proceeds = _safe_sum(record.amount for record in sell_records)

    realized_values = [record.realized_profit for record in sell_records if record.realized_profit is not None]
    realized_profit = _safe_sum(realized_values) if realized_values else total_proceeds - total_cost
    realized_profit_percent = (realized_profit / total_cost * 100) if total_cost > 0 else None

    latest_record = ordered_records[-1]
    return {
        'asset_id': asset_id,
        'asset_name': latest_record.asset_name,
        'symbol': latest_record.symbol,
        'asset_type': latest_record.asset_type,
        'currency': latest_record.currency,
        'buy_quantity': buy_quantity,
        'sell_quantity': sell_quantity,
        'total_cost': total_cost,
        'total_proceeds': total_proceeds,
        'realized_profit': realized_profit,
        'realized_profit_percent': _round_or_none(realized_profit_percent),
        'first_buy_at': first_buy_at.isoformat(),
        'closed_at': closed_at.isoformat(),
        'holding_days': holding_days,
        'records': [_record_to_dict(record) for record in ordered_records],
    }


def _build_summary(positions):
    closed_count = len(positions)
    win_count = len([item for item in positions if item['realized_profit'] > 0])
    loss_count = len([item for item in positions if item['realized_profit'] < 0])
    percent_values = [
        item['realized_profit_percent']
        for item in positions
        if item['realized_profit_percent'] is not None
    ]
    holding_days_values = [item['holding_days'] for item in positions]
    return {
        'closed_count': closed_count,
        'total_realized_profit': _safe_sum(item['realized_profit'] for item in positions),
        'win_count': win_count,
        'loss_count': loss_count,
        'win_rate': round(win_count / closed_count * 100, 4) if closed_count else None,
        'average_realized_profit_percent': round(sum(percent_values) / len(percent_values), 4) if percent_values else None,
        'average_holding_days': round(sum(holding_days_values) / len(holding_days_values), 4) if holding_days_values else None,
    }


@analytics_bp.route('/closed-positions', methods=['GET'])
@jwt_required()
def get_closed_positions():
    user_id = _current_user_id()
    records = (
        TradeRecord.query
        .filter(TradeRecord.user_id == user_id, TradeRecord.asset_id.isnot(None))
        .order_by(TradeRecord.created_at.asc(), TradeRecord.id.asc())
        .all()
    )

    records_by_asset = defaultdict(list)
    for record in records:
        records_by_asset[record.asset_id].append(record)

    positions = [
        position
        for asset_id, grouped_records in records_by_asset.items()
        for position in [_build_closed_position(asset_id, grouped_records)]
        if position is not None
    ]
    positions.sort(key=lambda item: item['closed_at'], reverse=True)

    return jsonify({
        'summary': _build_summary(positions),
        'positions': positions,
    })
