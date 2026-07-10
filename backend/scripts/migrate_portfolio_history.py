from app import app
from db import db
from models import PortfolioHistorySnapshot
from services.portfolio_history import migrate_existing_users_history


def ensure_portfolio_history_table():
    PortfolioHistorySnapshot.__table__.create(db.engine, checkfirst=True)


def migrate_portfolio_history():
    with app.app_context():
        ensure_portfolio_history_table()
        return migrate_existing_users_history()


if __name__ == '__main__':
    count = migrate_portfolio_history()
    print(f'portfolio history snapshots backfilled: {count}')
