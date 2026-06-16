from datetime import datetime
from db import db
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    preferred_currency = db.Column(db.String(10), default='CNY')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    assets = db.relationship('Asset', backref='user', lazy=True, cascade='all, delete-orphan')
    alerts = db.relationship('Alert', backref='user', lazy=True, cascade='all, delete-orphan')
    trade_records = db.relationship('TradeRecord', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'preferred_currency': self.preferred_currency,
            'created_at': self.created_at.isoformat()
        }

class Asset(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    symbol = db.Column(db.String(50), nullable=False)
    asset_type = db.Column(db.String(20), nullable=False)
    buy_price = db.Column(db.Float, nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
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
            'updated_at': self.updated_at.isoformat()
        }

class Alert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    asset_id = db.Column(db.Integer, db.ForeignKey('asset.id'), nullable=False)
    target_price = db.Column(db.Float, nullable=False)
    alert_type = db.Column(db.String(10), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    notification_method = db.Column(db.String(50), default='popup')
    triggered = db.Column(db.Boolean, default=False)
    triggered_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    asset = db.relationship('Asset', backref=db.backref('alerts', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'asset_id': self.asset_id,
            'target_price': self.target_price,
            'alert_type': self.alert_type,
            'is_active': self.is_active,
            'notification_method': self.notification_method,
            'triggered': self.triggered,
            'triggered_at': self.triggered_at.isoformat() if self.triggered_at else None,
            'created_at': self.created_at.isoformat()
        }

class TradeRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    asset_id = db.Column(db.Integer)
    action = db.Column(db.String(10), nullable=False)
    asset_name = db.Column(db.String(100), nullable=False)
    symbol = db.Column(db.String(50), nullable=False)
    asset_type = db.Column(db.String(20), nullable=False)
    price = db.Column(db.Float, nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    amount = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(10), nullable=False)
    cost_basis = db.Column(db.Float)
    realized_profit = db.Column(db.Float)
    realized_profit_percent = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'asset_id': self.asset_id,
            'action': self.action,
            'asset_name': self.asset_name,
            'symbol': self.symbol,
            'asset_type': self.asset_type,
            'price': self.price,
            'quantity': self.quantity,
            'amount': self.amount,
            'currency': self.currency,
            'cost_basis': self.cost_basis,
            'realized_profit': self.realized_profit,
            'realized_profit_percent': self.realized_profit_percent,
            'created_at': self.created_at.isoformat()
        }
