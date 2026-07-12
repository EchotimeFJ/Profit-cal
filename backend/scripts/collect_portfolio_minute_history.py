import json
import os
import sys


sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app  # noqa: E402
from scripts.migrate_portfolio_minute_history import ensure_portfolio_minute_history_table  # noqa: E402
from services.portfolio_history import collect_all_user_minute_snapshots  # noqa: E402


def collect_portfolio_minute_history():
    with app.app_context():
        ensure_portfolio_minute_history_table()
        return collect_all_user_minute_snapshots()


if __name__ == '__main__':
    result = collect_portfolio_minute_history()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    sys.exit(1 if result['failed'] else 0)
