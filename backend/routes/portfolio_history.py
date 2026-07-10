from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from db import db
from models import PortfolioHistorySnapshot, User
from services.portfolio_history import normalize_history_currency, upsert_history_snapshot


portfolio_history_bp = Blueprint('portfolio_history', __name__, url_prefix='/api/portfolio')


def _current_user_id():
    return int(get_jwt_identity())


def _current_user():
    return db.session.get(User, _current_user_id())


def _user_not_found_response():
    return jsonify({'error': '用户不存在'}), 404


@portfolio_history_bp.route('/history', methods=['GET'])
@jwt_required()
def get_portfolio_history():
    user_id = _current_user_id()
    user = db.session.get(User, user_id)
    if user is None:
        return _user_not_found_response()

    currency = normalize_history_currency(request.args.get('currency'), user)
    snapshots = (
        PortfolioHistorySnapshot.query
        .filter_by(user_id=user_id, settlement_currency=currency)
        .order_by(PortfolioHistorySnapshot.snapshot_date.asc(), PortfolioHistorySnapshot.id.asc())
        .all()
    )
    return jsonify({
        'currency': currency,
        'points': [
            {
                'date': snapshot.snapshot_date.isoformat(),
                'total_investment': snapshot.total_investment,
                'total_current_value': snapshot.total_current_value,
                'total_profit': snapshot.total_profit,
                'total_profit_percent': snapshot.total_profit_percent,
                'daily_profit': snapshot.daily_profit,
            }
            for snapshot in snapshots
        ],
    })


@portfolio_history_bp.route('/history/snapshot', methods=['POST'])
@jwt_required()
def create_portfolio_history_snapshot():
    user = _current_user()
    if user is None:
        return _user_not_found_response()

    if not request.is_json:
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400

    currency = normalize_history_currency(data.get('currency'), user)
    existing = PortfolioHistorySnapshot.query.filter_by(
        user_id=user.id,
        snapshot_date=date.today(),
        settlement_currency=currency,
    ).first()
    snapshot = upsert_history_snapshot(user, currency)
    db.session.commit()
    return jsonify({'snapshot': snapshot.to_dict()}), 200 if existing else 201
