2026-07-12 Task 1 completed:
- Added `PortfolioMinuteSnapshot` with minute timestamp, settlement currency, summary fields, JSON payload text, created/updated timestamps, and unique `(user_id, snapshot_minute, settlement_currency)` constraint.
- Added idempotent minute table migration script `backend/scripts/migrate_portfolio_minute_history.py`; it only creates the new minute snapshot table with `checkfirst=True`.
- Added minute collection service APIs `upsert_minute_snapshot()` and `collect_all_user_minute_snapshots()`; collection uses each user's preferred currency, truncates timestamps to minute precision, commits per successful user, rolls back failed users, and continues.
- Added non-interactive scheduler entrypoint `backend/scripts/collect_portfolio_minute_history.py`, which ensures the table exists and prints JSON collection results.
- Added backend tests in `backend/test_portfolio_history.py` for migration safety, idempotent same-minute upsert, all-user collection, price failure fallback, and old data immutability.
- Updated CI compile checks to include `models.py` and the new minute migration/collection scripts.
