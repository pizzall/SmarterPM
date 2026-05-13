# SmarterPM 公司执行模拟系统

基于《公司执行模拟系统设计方案 v0.3》实现的本地化任务人选推荐工具。

## 特性

- 在指定的组织结构范围内，为负责人推荐最合适的任务执行人选组合
- 提供可解释的推荐理由，支持负责人二次纠正
- 随纠正记录动态更新人员能力模型
- 字段缺失时通过逐级推断保证候选人不被排除
- 全部业务数据集中在单一 `database.json`，复制即迁移

## 快速开始

```bash
pip install -r requirements.txt
python -m backend.main
```

浏览器访问 [http://127.0.0.1:11011/](http://127.0.0.1:11011/)。

## 配置

编辑项目根目录的 `config.json`：

- `server.port`：服务端口，默认 `11011`
- `llm.base_url` / `llm.api_key` / `llm.model`：OpenAI 兼容协议（OpenAI、DeepSeek、Kimi、通义、智谱等均可）
- `storage.database_file`：数据库文件名，默认 `database.json`

> `api_key` 为空时系统自动降级为离线 mock 模式，所有 AI 接口仍可演示流程。

## 数据迁移

整个系统的业务数据全部存放于项目根目录的 `database.json` 一个文件：

- **备份**：复制 `database.json` 到任意位置即可
- **迁移**：在新机器上把 `database.json` 放到项目根目录，启动即生效
- **覆盖**：在 UI 顶部点击「导入数据库」上传 JSON 文件，系统会先自动备份当前库再覆盖
- **重置**：UI 顶部「重置」按钮可恢复为内置示例数据（操作前自动备份）

写入操作均会先把当前数据库备份到 `backups/database-<时间戳>.json`，最多保留 20 份滚动历史。

## 功能清单

1. 部门 / 人员的增删改（按钮 + JSON 文本两种输入方式）
2. 查看所有模拟人元数据，缺失字段标注推断来源
3. 自然语言描述任务，支持多轮对话二次澄清
4. 任务规划完毕后生成 2-3 套候选方案，附匹配理由 / 团队适配评语 / 优势 / 风险
5. 方案二次修改，旧版本保留
6. 任务的增删改
7. 任务回顾评价
8. 基于二次方案 / 回顾内容生成能力值变更提案，管理者可微调后一键应用
9. 全局自由对话框：可以提问 / 提建议（默认只读，写操作需 UI 二次确认）
10. H5 图形化界面，端口可在 `config.json` 配置

## UX 改进（基于 [UX-IMPROVEMENT-PLAN.md](UX-IMPROVEMENT-PLAN.md)）

新增前端组件库（`frontend/js/components/`）与后端 metadata API，消灭 JSON / ID / 逗号分隔的高负担输入：

- **录入层**：员工 / 任务 / 方案表单全部表单化；技能 → `skill-editor`，部门 → `dept-picker`，复杂度 / MBTI / 角色倾向 → `enum-select`，1-5 数值 → `slider`，需求技能 / 工作范围 → `multi-select`，发起人 / 作者 → `employee-picker`，Sprint → `sprint-picker`。
- **方案对比**：方案成员显示「姓名 · 角色 badge」，支持点击成员一键替换 + 多套方案并列对比。
- **新视图**：
  - `#/people-status`：人员实时状态面板（含 active_task_count、过载色标）
  - `#/board`：任务状态看板，拖拽改 status
  - `#/sprints`：Sprint 简报，进度堆叠条与统计
  - `#/notifications`：通知中心（方案 finalize / 回顾 / 能力值待审 / 进度变更）
- **全局体验**：深色模式（顶栏切换 + localStorage）、响应式断点、`Ctrl/Cmd+S` 保存当前表单、`Esc` 关闭对话框、`Ctrl/Cmd+K` 唤起全局搜索（员工 / 任务 / 技能 / 部门）、骨架屏替换 loading。
- **新增字段**：任务 `priority` / `budget_cap` / `progress` / `blockers` / `milestones` / `depends_on`，员工 `cost_rate`。Sprint 简报与看板按优先级排序、显示色标，推荐器会在任务设置 `budget_cap` 时把高成本员工降权（软约束）。
- **新增后端接口**：
  - `GET /api/enums`：枚举字段元数据（值 + 中文标签 + 说明）
  - `GET /api/libraries`：技能库 / 工作范围 / 部门 / Sprint / 员工索引
  - `GET /api/tasks/{id}/conflicts`：跨任务资源冲突检测
  - `GET /api/employees`（增强）：附带 `_load` 字段
  - `GET|POST|DELETE /api/notifications`、`/api/notifications/unread_count`、`/api/notifications/mark_read`

### 验收场景

通过下列场景即视为 UX 改造达标，无需再依赖 JSON / ID 记忆：

1. 给员工加技能：`+ 添加技能` → 下拉 → Slider → 保存
2. 设置复杂度：下拉看到"高级（跨部门）"说明
3. 选发起人 / 负责人：下拉搜索看到「姓名（emp_002）」
4. 输入沟通能力：Slider + 中文标签
5. 方案成员显示「王翰林 · Leader」
6. 完整员工档案录入：无一处 JSON
7. 切换深色模式不闪烁；`Ctrl/Cmd+S` 保存当前表单
8. `#/people-status` 看到每人当前负载与所在任务
9. 方案页提示「赵祉皓已在 task_xxx 中」资源冲突
10. `#/board` 拖拽改任务状态
11. 顶栏铃铛收到「方案已 finalize / 回顾已记录 / 能力值待审」通知

## 目录结构

```
SmarterPM/
├── config.json          端口 + LLM 配置（不在 UI 暴露）
├── database.json        全部业务数据（单文件 = 完整迁移单元）
├── backups/             写前自动备份
├── backend/             FastAPI 后端
└── frontend/            纯 HTML + 原生 JS H5 前端
```

## 设计参考

- 顶层设计：`公司执行模拟系统设计方案 v0.3.md`
- 实现说明：`.doc/IMPLEMENTATION.md`
