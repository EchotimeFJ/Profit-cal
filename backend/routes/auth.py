from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import func, or_
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

def _normalize_username(value):
    return (value or '').strip()

def _normalize_email(value):
    return (value or '').strip().lower()

def _find_user_by_identifier(value):
    identifier = _normalize_username(value)
    if not identifier:
        return None

    normalized_email = _normalize_email(identifier)
    return User.query.filter(
        or_(
            User.username == identifier,
            func.lower(User.email) == normalized_email,
        )
    ).first()

def _find_user_by_email(value):
    email = _normalize_email(value)
    if not email:
        return None
    return User.query.filter(func.lower(User.email) == email).first()

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

    username = _normalize_username(data.get('username'))
    email = _normalize_email(data.get('email'))

    if not username or not email:
        return jsonify({'error': '请填写完整信息'}), 400

    try:
        password = _extract_password(data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': '用户名已存在'}), 400

    if _find_user_by_email(email):
        return jsonify({'error': '邮箱已被注册'}), 400

    user = User(username=username, email=email)
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

    identifier = (data or {}).get('identifier') or (data or {}).get('username')
    if not data or not identifier or not (data.get('password') or data.get('encrypted_password')):
        return jsonify({'error': '请输入用户名和密码'}), 400

    try:
        password = _extract_password(data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    user = _find_user_by_identifier(identifier)

    if not user or not user.check_password(password):
        return jsonify({'error': '账号/邮箱或密码错误'}), 401

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

    username = _normalize_username(data.get('username'))
    if username and username != user.username:
        if User.query.filter_by(username=username).first():
            return jsonify({'error': '用户名已存在'}), 400
        user.username = username

    email = _normalize_email(data.get('email'))
    if email and email != _normalize_email(user.email):
        existing = _find_user_by_email(email)
        if existing and existing.id != user.id:
            return jsonify({'error': '邮箱已被注册'}), 400
        user.email = email

    db.session.commit()

    return jsonify({
        'message': '更新成功',
        'user': user.to_dict()
    })

@auth_bp.route('/forgot-password', methods=['PUT'])
def forgot_password():
    data = request.get_json() or {}
    email = _normalize_email(data.get('email'))

    if not email:
        return jsonify({'error': '请输入绑定邮箱'}), 400

    user = _find_user_by_email(email)
    if not user:
        return jsonify({'error': '绑定邮箱不存在'}), 404

    if not (data.get('password') or data.get('encrypted_password')):
        return jsonify({'error': '请输入新密码'}), 400

    try:
        password = _extract_password(data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    if not password or len(password.strip()) < 6:
        return jsonify({'error': '新密码至少需要 6 位'}), 400

    user.set_password(password)
    db.session.commit()

    return jsonify({'message': '密码重置成功'})

@auth_bp.route('/change-password', methods=['PUT'])
@jwt_required()
def change_password():
    user_id = _current_user_id()
    user = User.query.get(user_id)

    if not user:
        return jsonify({'error': '用户不存在'}), 404

    data = request.get_json() or {}
    email = _normalize_email(data.get('email'))

    if not email:
        return jsonify({'error': '请输入绑定邮箱'}), 400

    if email != _normalize_email(user.email):
        return jsonify({'error': '绑定邮箱校验失败'}), 400

    if not (data.get('password') or data.get('encrypted_password')):
        return jsonify({'error': '请输入新密码'}), 400

    try:
        password = _extract_password(data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    if not password or len(password.strip()) < 6:
        return jsonify({'error': '新密码至少需要 6 位'}), 400

    user.set_password(password)
    db.session.commit()

    return jsonify({'message': '密码修改成功'})
