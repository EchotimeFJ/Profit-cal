import os
import sys


sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import PortfolioMinuteSnapshot  # noqa: E402


def ensure_portfolio_minute_history_table():
    PortfolioMinuteSnapshot.__table__.create(db.engine, checkfirst=True)


def migrate_portfolio_minute_history():
    with app.app_context():
        ensure_portfolio_minute_history_table()
        return {'created_table': True}


if __name__ == '__main__':
    migrate_portfolio_minute_history()
    print('portfolio minute history table ensured')
