from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from db import db
from models import Alert, Asset

alerts_bp = Blueprint('alerts', __name__, url_prefix='/api/alerts')

def _current_user_id():
    return int(get_jwt_identity())

@alerts_bp.route('', methods=['GET'])
@jwt_required()
def get_alerts():
    user_id = _current_user_id()
    alerts = Alert.query.filter_by(user_id=user_id).all()
    return jsonify({'alerts': [alert.to_dict() for alert in alerts]})

@alerts_bp.route('', methods=['POST'])
@jwt_required()
def create_alert():
    user_id = _current_user_id()
    data = request.get_json()
    
    required_fields = ['asset_id', 'target_price', 'alert_type']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '请填写提醒资产、目标价格和提醒类型'}), 400
    
    asset = Asset.query.filter_by(id=data['asset_id'], user_id=user_id).first()
    if not asset:
        return jsonify({'error': '资产不存在'}), 404
    
    alert = Alert(
        user_id=user_id,
        asset_id=data['asset_id'],
        target_price=data['target_price'],
        alert_type=data['alert_type'],
        notification_method=data.get('notification_method', 'popup')
    )
    
    db.session.add(alert)
    db.session.commit()
    
    return jsonify({
        'message': '提醒已添加',
        'alert': alert.to_dict()
    }), 201

@alerts_bp.route('/<int:alert_id>', methods=['PUT'])
@jwt_required()
def update_alert(alert_id):
    user_id = _current_user_id()
    alert = Alert.query.filter_by(id=alert_id, user_id=user_id).first()
    
    if not alert:
        return jsonify({'error': '提醒不存在'}), 404
    
    data = request.get_json()
    
    if data.get('target_price') is not None:
        alert.target_price = data['target_price']
    if data.get('alert_type'):
        alert.alert_type = data['alert_type']
    if data.get('is_active') is not None:
        alert.is_active = data['is_active']
    if data.get('notification_method'):
        alert.notification_method = data['notification_method']
    if data.get('triggered') is not None:
        alert.triggered = data['triggered']
        if data['triggered']:
            alert.triggered_at = datetime.utcnow()
        else:
            alert.triggered_at = None
    
    db.session.commit()
    
    return jsonify({
        'message': '提醒已更新',
        'alert': alert.to_dict()
    })

@alerts_bp.route('/<int:alert_id>', methods=['DELETE'])
@jwt_required()
def delete_alert(alert_id):
    user_id = _current_user_id()
    alert = Alert.query.filter_by(id=alert_id, user_id=user_id).first()
    
    if not alert:
        return jsonify({'error': '提醒不存在'}), 404
    
    db.session.delete(alert)
    db.session.commit()
    
    return jsonify({'message': '提醒已删除'})
