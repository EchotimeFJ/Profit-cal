2026-07-12 Task 1 completed:
- Added `PortfolioMinuteSnapshot` with minute timestamp, settlement currency, summary fields, JSON payload text, created/updated timestamps, and unique `(user_id, snapshot_minute, settlement_currency)` constraint.
- Added idempotent minute table migration script `backend/scripts/migrate_portfolio_minute_history.py`; it only creates the new minute snapshot table with `checkfirst=True`.
- Added minute collection service APIs `upsert_minute_snapshot()` and `collect_all_user_minute_snapshots()`; collection uses each user's preferred currency, truncates timestamps to minute precision, commits per successful user, rolls back failed users, and continues.
- Added non-interactive scheduler entrypoint `backend/scripts/collect_portfolio_minute_history.py`, which ensures the table exists and prints JSON collection results.
- Added backend tests in `backend/test_portfolio_history.py` for migration safety, idempotent same-minute upsert, all-user collection, price failure fallback, and old data immutability.
- Updated CI compile checks to include `models.py` and the new minute migration/collection scripts.

2026-07-12 Task 2 completed:
- Updated `GET /api/portfolio/history` to read `PortfolioMinuteSnapshot` instead of daily manual snapshots.
- Added `range=1d|3d|7d` support with a default `1d` window and `400` responses for unsupported ranges.
- Kept `currency` query compatibility while defaulting to the user's preferred settlement currency.
- Returned minute points sorted by `timestamp` ascending, including both `timestamp` and compatible `date` fields.
- Added backend tests for empty read-only responses, user isolation, range filtering, ordering, preferred/explicit currency behavior, and invalid range safety.

2026-07-12 Task 4 completed:
- Confirmed CI runs `test_portfolio_history.py` and compile checks for `services/portfolio_history.py`, `scripts/migrate_portfolio_minute_history.py`, and `scripts/collect_portfolio_minute_history.py`.
- Added cron deployment instructions to `README.md` and `QUICKSTART.md` for running `scripts/collect_portfolio_minute_history.py` every minute.
- Verified backend regression and compile checks, frontend production build, and `git diff --check`.
- Re-reviewed data safety: migration only creates the new minute table, the scheduled collector writes `PortfolioMinuteSnapshot`, and history range reads do not mutate old asset, trade, alert, or daily history rows.

## Round 2

- Completed Task 3 and Task 4, with all tasks and checklist items checked.
- Fixed Task 3 review issues: protected range history requests from stale async responses, normalized naive UTC timestamps in the chart, and made `date` optional for timestamp-only history points.
- Verified requirements with independent checklist review: 12/12 PASS, no failed checkpoints, no follow-up tasks required.
- Passed backend unittest/compileall checks, frontend production build, and `git diff --check`.
- Updated deployment documentation with every-minute cron examples for `backend/scripts/collect_portfolio_minute_history.py`.
- Files changed: `.trae/specs/automate-minute-portfolio-history/tasks.md`, `.trae/specs/automate-minute-portfolio-history/checklist.md`, `.trae/specs/automate-minute-portfolio-history/progress.md`, `README.md`, `QUICKSTART.md`, `frontend/src/types.ts`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/components/PortfolioHistoryChart.tsx`.

## Round 3

- **结论**: PASS
- **已审核范围**: 后端分钟级快照模型/迁移/采集服务/调度脚本、`GET /api/portfolio/history` 范围查询、前端历史净值图范围请求与渲染、部署说明、CI 等价验证命令
- **验证结果**:
  - Build/Runtime: pass；`python -m compileall ...` 退出码 0，`npm run build` 退出码 0（`tsc && vite build`，1676 modules transformed），`git diff --check` 退出码 0；初始 `python`/`python3.9` 失败为本机解释器/依赖环境问题，已用 CI 对齐的 `/opt/homebrew/bin/python3.11` 临时 venv 重跑通过
  - Tests/Coverage: pass；CI 等价后端 unittest 退出码 0，78 tests OK；对抗性探针 `test_history_rejects_invalid_range_without_writing` 退出码 0，1 test OK
  - Checklist audit: 12/12 passed, 0 failed
- **风险和问题**: 未发现范围内阻断问题；剩余风险为未启动真实 cron/生产数据库长时间采集验证，当前仅通过脚本/服务测试、构建和文档命令覆盖
