# 自动分钟级组合历史 Spec

## Why
当前组合历史净值依赖“手动刷新生成的每日快照”，用户打开页面时无法看到持续记录的盘中/短周期变化。需要改为系统每 1 分钟自动采集每个用户组合状态，让用户打开页面即可查看已沉淀的 1日、3日、7日历史曲线。

## What Changes
- 新增分钟级组合快照能力，系统每 1 分钟采集每个用户当前组合状态。
- 新增安全迁移，只创建分钟级快照表，不修改、不覆盖、不删除旧数据。
- 新增幂等采集服务和脚本，支持外部 cron/scheduler 每分钟调用。
- 历史查询接口改为读取分钟级快照，并支持 `1d`、`3d`、`7d` 范围。
- 前端历史净值图改为使用后端范围参数，不再在前端自行裁剪日级数据。
- 移除“基于手动刷新生成的每日快照，历史查询不会写入数据”文案，改为自动记录说明。
- 保留原日级快照表和手动快照接口，作为兼容能力，不作为新图表主数据源。

## Impact
- Affected specs: 组合历史净值、资产价格聚合、历史查询、CI 回归测试、部署运维说明。
- Affected code: `backend/models.py`、`backend/services/portfolio_history.py`、`backend/routes/portfolio_history.py`、`backend/scripts/*`、`backend/test_portfolio_history.py`、`frontend/src/types.ts`、`frontend/src/components/PortfolioHistoryChart.tsx`、`frontend/src/pages/Dashboard.tsx`、`.github/workflows/ci.yml`。

## ADDED Requirements
### Requirement: 分钟级快照模型
The system SHALL persist portfolio history snapshots at minute precision without modifying existing daily snapshots or user asset data.

#### Scenario: Migration creates only the new table
- **WHEN** the migration script is executed
- **THEN** it creates the minute snapshot table if missing
- **AND** it does not update, delete, or backfill existing `Asset`、`TradeRecord`、`Alert`、`PortfolioHistorySnapshot` rows
- **AND** repeated execution is safe

#### Scenario: Duplicate minute collection is idempotent
- **WHEN** collection runs twice for the same user, minute, and settlement currency
- **THEN** only one minute snapshot row exists for that unique tuple
- **AND** the row reflects the latest calculated values for that minute

### Requirement: 每分钟自动采集
The system SHALL provide a non-interactive backend script that can be scheduled every minute to collect snapshots for all users.

#### Scenario: Scheduled collection records all users
- **WHEN** the script is invoked by cron or another scheduler
- **THEN** it iterates all users
- **AND** it records one current-minute portfolio snapshot per user using each user's preferred settlement currency
- **AND** it commits successful snapshots without requiring any user request

#### Scenario: Collection remains safe on price failure
- **WHEN** live price calculation fails for a user
- **THEN** collection falls back to the existing cost-basis baseline behavior
- **AND** collection continues for the remaining users
- **AND** it never mutates user assets or trade records

### Requirement: 范围化历史查询
The system SHALL expose portfolio history data for `1d`、`3d`、`7d` using minute snapshots.

#### Scenario: User requests 1 day history
- **WHEN** authenticated user calls `GET /api/portfolio/history?range=1d`
- **THEN** the response contains only that user's minute snapshots from the last 1 day
- **AND** points are sorted ascending by timestamp
- **AND** each point includes `timestamp`、`date`、`total_investment`、`total_current_value`、`total_profit`、`total_profit_percent`、`daily_profit`

#### Scenario: User requests 3 day or 7 day history
- **WHEN** authenticated user calls `GET /api/portfolio/history?range=3d` or `range=7d`
- **THEN** the response contains minute snapshots from the selected window
- **AND** no other user's snapshots are returned

#### Scenario: Unsupported range is requested
- **WHEN** authenticated user calls `GET /api/portfolio/history?range=30d`
- **THEN** the API returns `400`
- **AND** no data is written

### Requirement: 前端图表读取自动快照
The frontend SHALL render the portfolio history chart from backend range responses instead of relying on manual daily snapshots or local-only filtering.

#### Scenario: User switches range
- **WHEN** user selects `1日`、`3日`、or `7日`
- **THEN** frontend requests the matching backend range
- **AND** chart updates using returned minute snapshot points
- **AND** chart keeps amount Y-axis and time X-axis visible

#### Scenario: No automatic snapshots yet
- **WHEN** history API returns no points
- **THEN** frontend shows a clear empty state explaining that automatic snapshots will appear after background collection runs
- **AND** it does not instruct users to manually refresh to create history

## MODIFIED Requirements
### Requirement: 组合历史净值说明
The chart copy SHALL describe automatic background recording and SHALL NOT claim that history is based on manually refreshed daily snapshots.

### Requirement: 历史查询安全
History query endpoints SHALL remain read-only. Only the scheduled collection script/service may write minute snapshots.

## REMOVED Requirements
### Requirement: 图表主数据依赖手动每日快照
**Reason**: 用户要求打开页面即可看到系统自动沉淀的记录，手动每日快照无法满足 1日/3日/7日短周期趋势。
**Migration**: 保留旧日级表和手动快照接口用于兼容，不删除旧数据；新增分钟级表作为图表主数据源。
