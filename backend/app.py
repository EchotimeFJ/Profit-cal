import os
from datetime import timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from dotenv import load_dotenv
from db import db

load_dotenv()

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///profit_cal.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)

db.init_app(app)
jwt = JWTManager(app)

from models import User, Asset, Alert
from routes.auth import auth_bp
from routes.assets import assets_bp
from routes.alerts import alerts_bp
from routes.prices import prices_bp

app.register_blueprint(auth_bp)
app.register_blueprint(assets_bp)
app.register_blueprint(alerts_bp)
app.register_blueprint(prices_bp)

with app.app_context():
    db.create_all()

@app.route('/')
def health_check():
    return jsonify({'status': 'ok', 'message': 'Profit Cal API is running'})

if __name__ == '__main__':
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    host = os.getenv('FLASK_HOST', '127.0.0.1')
    port = int(os.getenv('FLASK_PORT', '8002'))
    app.run(host=host, port=port, debug=debug, use_reloader=debug)
