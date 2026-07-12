# Tasks
- [x] Task 1: 后端分钟级快照模型、迁移与采集服务
  - [x] SubTask 1.1: 新增 `PortfolioMinuteSnapshot` 模型，包含用户、分钟时间、结算币种、组合汇总字段、payload、创建/更新时间和唯一约束
  - [x] SubTask 1.2: 新增幂等迁移脚本，只创建分钟级快照表，不修改旧表或旧数据
  - [x] SubTask 1.3: 新增分钟级采集服务，复用现有组合估值逻辑，按用户 preferred currency 采集，失败时走成本基线 fallback
  - [x] SubTask 1.4: 新增每分钟可调度脚本，支持非交互执行并输出采集结果
  - [x] SubTask 1.5: 新增后端测试，覆盖迁移安全、幂等写入、全用户采集、价格失败 fallback、只写新表不改旧数据

- [ ] Task 2: 后端历史查询接口改为分钟级范围查询
  - [ ] SubTask 2.1: 扩展 `GET /api/portfolio/history` 支持 `range=1d|3d|7d`
  - [ ] SubTask 2.2: 查询当前用户分钟级快照，按 timestamp 升序返回
  - [ ] SubTask 2.3: 对非法 range 返回 400，且不写数据库
  - [ ] SubTask 2.4: 保持旧 `currency` 参数兼容，默认使用用户 preferred currency
  - [ ] SubTask 2.5: 新增接口测试，覆盖用户隔离、范围过滤、排序、空状态、非法范围

- [ ] Task 3: 前端历史净值图接入自动分钟级数据
  - [ ] SubTask 3.1: 更新 `PortfolioHistoryPoint` 类型，支持 `timestamp` 字段并兼容 `date`
  - [ ] SubTask 3.2: 更新 Dashboard 历史接口调用，切换 `1日/3日/7日` 时请求后端对应 range
  - [ ] SubTask 3.3: 更新图表组件，移除前端本地范围裁剪，使用后端返回点位渲染金额 Y 轴和时间 X 轴
  - [ ] SubTask 3.4: 移除“手动刷新生成每日快照”文案，改为“系统自动记录组合历史”
  - [ ] SubTask 3.5: 保持移动端不横向溢出，点位为空或单点时展示稳定空态/坐标框架

- [ ] Task 4: CI、回归与部署说明
  - [ ] SubTask 4.1: 将新增后端测试、脚本和服务加入 CI unittest 与 compileall
  - [ ] SubTask 4.2: 执行完整后端回归、前端构建、空白检查
  - [ ] SubTask 4.3: 更新现有说明文档，给出 cron 每分钟执行采集脚本的部署命令
  - [ ] SubTask 4.4: 最终复核数据安全：不修改旧资产、交易、提醒、日级历史数据

# Task Dependencies
- Task 2 depends on Task 1 because range query requires minute snapshot storage.
- Task 3 depends on Task 2 because frontend must consume the final API contract.
- Task 4 depends on Task 1, Task 2, and Task 3.
- Task 1 tests and Task 2 tests can be reviewed in parallel after their implementations complete.
