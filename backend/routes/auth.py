from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from db import db
from models import User
from services.password_crypto import decrypt_password, get_public_key_pem

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def _current_user_id():
    return int(get_jwt_identity())

def _extract_password(data):
    if data.get('encrypted_password'):
        return decrypt_password(data['encrypted_password'])
    return data.get('password')

@auth_bp.route('/password-key', methods=['GET'])
def password_key():
    return jsonify({
        'algorithm': 'RSA-OAEP-256',
        'public_key': get_public_key_pem()
    })

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('email') or not (data.get('password') or data.get('encrypted_password')):
        return jsonify({'error': '请填写完整信息'}), 400
    
    try:
        password = _extract_password(data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': '用户名已存在'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': '邮箱已被注册'}), 400
    
    user = User(username=data['username'], email=data['email'])
    user.set_password(password)
    
    if data.get('preferred_currency'):
        user.preferred_currency = data['preferred_currency']
    
    db.session.add(user)
    db.session.commit()
    
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        'message': '注册成功',
        'access_token': access_token,
        'user': user.to_dict()
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    
    if not data or not data.get('username') or not (data.get('password') or data.get('encrypted_password')):
        return jsonify({'error': '请输入用户名和密码'}), 400
    
    try:
        password = _extract_password(data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not user.check_password(password):
        return jsonify({'error': '用户名或密码错误'}), 401
    
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        'message': '登录成功',
        'access_token': access_token,
        'user': user.to_dict()
    })

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    user_id = _current_user_id()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    
    return jsonify({'user': user.to_dict()})

@auth_bp.route('/me', methods=['PUT'])
@jwt_required()
def update_user():
    user_id = _current_user_id()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    
    data = request.get_json()
    
    if data.get('preferred_currency'):
        user.preferred_currency = data['preferred_currency']
    
    if data.get('username') and data['username'] != user.username:
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'error': '用户名已存在'}), 400
        user.username = data['username']
    
    if data.get('email') and data['email'] != user.email:
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': '邮箱已被注册'}), 400
        user.email = data['email']
    
    db.session.commit()
    
    return jsonify({
        'message': '更新成功',
        'user': user.to_dict()
    })
