# SmarterPM 实现说明

本文档记录 SmarterPM 公司执行模拟系统当前版本（v0.1）的实现细节，作为《公司执行模拟系统设计方案 v0.3》之外的工程化补充。

## 1. 总体架构

```
+--------------------+        +--------------------------+
|  浏览器 H5 前端    |  HTTP  |  FastAPI 后端            |
|  (frontend/)       +<------>+  uvicorn 0.0.0.0:11011  |
+--------------------+        |  /api/* + 静态文件        |
                              +-----------+--------------+
                                          |
                                          v
                              +--------------------------+
                              |  core 层                  |
                              |  storage / llm_client /   |
                              |  recommender / inference  |
                              |  ability_updates / ...    |
                              +-----------+--------------+
                                          |
                                          v
                              +--------------------------+
                              |  database.json (单文件)   |
                              |  backups/<ts>.json        |
                              +--------------------------+
```

- 单进程 / 单端口部署，前后端同源，无需 CORS 折腾（已默认放开）。
- 全部业务数据集中在 `database.json` 一个文件，"复制 = 完整迁移"。
- LLM 走 OpenAI 兼容协议（`openai` SDK），通过 `config.json` 配置任意厂商；无 key 时自动降级为离线 mock，所有功能仍可演示。

## 2. 目录结构

```
SmarterPM/
├── config.json                项目配置（端口 + LLM）
├── database.json              业务数据全量（运行时自动生成）
├── backups/                   写前自动备份（最多 20 份滚动）
├── requirements.txt
├── README.md                  用户向使用文档
├── 公司执行模拟系统设计方案 v0.3.md   原始需求设计
├── .doc/
│   └── IMPLEMENTATION.md      本文档
├── backend/
│   ├── main.py                FastAPI 入口（uvicorn + 静态挂载）
│   ├── settings.py            config.json 解析
│   ├── api/                   路由层
│   │   ├── org.py             需求 1：部门 / 项目组 / 员工 CRUD
│   │   ├── employees.py       需求 2：人员元数据 + 推断来源
│   │   ├── tasks.py           需求 5：任务 CRUD
│   │   ├── planning.py        需求 3：任务规划 + 多轮对话
│   │   ├── proposals.py       需求 4：多套方案 + 二次修改
│   │   ├── reviews.py         需求 6：任务回顾评价
│   │   ├── ability_updates.py 需求 7：能力值变更审批
│   │   ├── chat.py            需求 8：全局自由对话
│   │   └── database.py        整库导入 / 导出 / 重置
│   ├── core/
│   │   ├── storage.py         单文件 JSON DB + 原子写 + 备份
│   │   ├── llm_client.py      openai SDK 封装 + 离线 fallback
│   │   ├── prompts.py         所有 system prompt 集中地
│   │   ├── recommender.py     搜索域 + 加权评分 + 候选组合
│   │   ├── inference.py       字段缺失逐级推断（设计 §4.2）
│   │   ├── correction_log.py  纠正日志追加 + 字段更新
│   │   └── ability_updates.py 能力值变更提案生成
│   └── models/schemas.py      Pydantic 输入模型
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js             fetch + Toast + el 工具
        ├── app.js             hash 路由 + 顶栏
        └── views/             7 个视图模块
```

## 3. 数据存储设计

### 3.1 单文件 JSON 数据库

为方便非技术人员迁移（"复制一个文件即完成搬迁"），整个系统的业务数据全部存储在项目根目录的 `database.json` 一个文件中。

顶层结构：

```json
{
  "meta": { "schema_version": 1, "created_at": "...", "updated_at": "..." },
  "org": { "id": "company", "children": [...] },
  "project_groups": [...],
  "employees": { "<id>": { ..., "correction_log": [...] } },
  "tasks": { "<id>": { ..., "proposals": [...], "review": [...] } },
  "sprints": { "<id>": {...} },
  "conversations": { "<id>": { "scope": "planning|free_chat", "messages": [...] } },
  "ability_update_proposals": { "<uid>": {...} }
}
```

### 3.2 读写策略

`backend/core/storage.py` 采用 **「内存镜像 + 原子持久化」** 模式：

1. **启动加载**：进程启动时一次性 `json.load` 整文件到 `Database._data`。
2. **读路径**：所有 `get_*` / `snapshot()` 返回 `_data` 的深拷贝，外部任何修改都不影响内存原值。
3. **写路径**：所有写操作必须通过 `with db.transaction(): ...` 进入。
   - 进入时获取 `RLock` 串行化；
   - 同时备份 `_data` 的深拷贝作为回滚快照；
   - 退出时执行 **写前备份 → tmp + os.replace 原子覆盖**；
   - 任何异常都会让 `_data` 回到进入前的状态，并把异常向上抛。
4. **备份**：每次落盘前把当前磁盘文件复制到 `backups/database-<时间戳>.json`，`config.json.storage.max_backups`（默认 20）控制滚动数量。

### 3.3 整库导入 / 导出

- `GET /api/database/export`：以附件方式直接下载 `database.json`。
- `POST /api/database/import`（multipart）：上传文件 → 校验顶层 `meta` → 自动备份当前库 → 整体替换内存 + 落盘。
- `POST /api/database/reset`：恢复内置默认数据（同样有备份），用于演示前清场。

前端顶栏的「导出 / 导入 / 重置」三个按钮直接对应。

## 4. 推荐引擎实现

### 4.1 字段缺失推断（§4.2）

`core/inference.py` 严格按设计文档分四类字段处理：

| 缺失字段 | 推断顺序 |
|---------|---------|
| `skills` | 直接录入 → 由 `work_scope` 关键字映射推断 → 跳过 |
| `mbti` | 直接录入 → `role_tendency + communication` 推断 → 跳过组合评估 |
| `communication` | 直接录入 → `correction_log` 历史 → 同部门均值 → 跳过 |
| `responsibility` | 直接录入 → 同部门均值 → 跳过 |

每条推断结果同时返回 `value` 与 `source`（如「使用部门均值估算（3.0）」），并以 `_inferred` 子对象附加到员工档案上，前端用灰色 badge 自然呈现，不打"新人 / 老员工"标签（与设计 §4.3 一致）。

### 4.2 搜索域扩展（§5.2）

`recommender.expand_scope()` 按复杂度逐级展开：

- `normal`：仅 requester 所属部门（含子部门）
- `advanced`：上一级 → 同辈所有子部门
- `epic`：全公司

### 4.3 加权评分

```
total = skill_score * 0.45 + scope_score * 0.20 + soft_score * 0.35 + trend_bonus
```

- `skill_score`：与 `required_skills` 的标签匹配 + 等级均值
- `scope_score`：候选人 `work_scope` 文本与需求技能关键字命中
- `soft_score`：沟通 / 责任 / 成长速度的均值（缺失走 §4.2 推断）
- `trend_bonus`：`rising` +0.3 / `declining` -0.3
- `role_fit`：组合阶段按角色倾向加权（leader/executor/reviewer 对应 1.5x）

### 4.4 候选组合

`build_candidate_groups()` 根据 `required_roles` 数量拆位，最多生成 3 套差异化组合：第二、三套会主动避开第一套核心成员，达到方案对比的目的。

最终的"团队适配评语 / 优势 / 风险 / 跨部门调用说明"由 LLM 基于打分结果生成（`PROPOSAL_NARRATE_SYSTEM`）。无 LLM 时使用模板化的 fallback。

## 5. 多轮对话与 finalize

### 5.1 任务规划（需求 3）

```
POST /api/planning/start          { description }
   -> { conversation_id, draft }

POST /api/planning/<cid>/refine   { user_message }
   -> { draft, reply }

POST /api/planning/<cid>/finalize { title?, sprint_id? }
   -> task
```

每个 conversation 持久化在 `db.conversations[<cid>]`，含完整消息历史 + 当前 `draft`。`finalize` 时把 draft 落到 `db.tasks[<task_id>]`，并通过 `from_conversation` 字段引用源对话。

### 5.2 自由对话（需求 8）

`POST /api/chat`：每次都把当前组织 / 员工 / 任务的"摘要快照"（不含纠正日志、原始 messages）一并送进 prompt。LLM 输出 `reply` + `suggested_actions` 列表。

> 安全策略：自由对话默认**只读**——不论 LLM 提出什么"建议操作"，前端不会自动执行任何写接口，必须由管理者复制建议到对应模块（员工编辑 / 任务编辑 / 方案修改）后再确认提交。

## 6. 能力值变更（需求 7）

两条触发链：

1. **方案二次修改**：`POST /api/tasks/<id>/proposals/<pid>/modify` 提交后，`generate_ability_proposals(trigger="proposal_modify")` 把"替换理由 / 反馈"映射成提案。
2. **任务回顾**：`POST /api/tasks/<id>/review` 提交后，`generate_ability_proposals(trigger="review")` 同上。

### 6.1 提案规则（设计 §6.2）

- 数值字段（`communication / responsibility / growth_rate` 与 `skill:<tag>`）单次调整 ±0.5，自动 clamp 到 [1, 5]。
- 枚举字段 `performance_trend` 仅在 `rising / stable / declining` 切换。
- LLM 输出后，`_validate_proposal` 做范围与字段类型再校验，不合法的直接丢弃。
- 离线 fallback 走关键字规则（如"沟通超预期 +0.5"）。

### 6.2 提案状态机

```
pending  --PATCH-->   edited  --apply-->  applied
   |                                ^
   +----------- apply --------------+
   |                                
   +----------- reject ---------->  rejected
```

应用时：

- 修改员工档案对应字段；
- 向 `employee.correction_log` 追加一条记录（不覆盖原值）。

## 7. LLM 客户端 fallback

`backend/core/llm_client.py` 单例模式：

- 启动时读取 `config.json` 创建 `OpenAI(base_url=..., api_key=..., timeout=...)`；
- `chat_json()` 使用 `response_format={"type":"json_object"}` 强制 JSON；
- 任何异常都会被吞掉，返回 `LLMResult(ok=False, ...)`，由调用方走 fallback 分支。

接口层都返回 `APIResponse(ai_status="ok"|"degraded"|"n/a")`，前端可识别并 toast 提示。

## 8. 前端实现要点

- 纯 HTML + 原生 JS，零构建步骤。
- `frontend/js/app.js`：自实现 hash 路由（含 `:param` 动态段），切换时只清空 `#app-main`。
- 各 view 文件向全局 `window.Views.<name>` 挂载 `render()`，便于路由调用。
- 表单 / JSON 双通道：`org.js`、`tasks.js` 内部维护 `mode` 状态，两 tab 切换互不丢失数据。
- Toast：`UI.showToast()` 简单的右上角提示，3 秒后自动隐藏。

## 9. 9 项需求映射

| 需求 | 后端 | 前端 |
|-----|-----|-----|
| 1. 部门 / 人员 CRUD（JSON / 按钮） | `api/org.py` + JSON 整体导入接口 | `views/org.js`（左树右编辑，form/json tab） |
| 2. 查看人员元数据 | `api/employees.py` + `core/inference.py` | `views/employees.js`（表格 + 推断 badge + 详情） |
| 3. 任务规划 + 二次对话 | `api/planning.py`（start / refine / finalize） | `views/planning.js`（左对话右草稿） |
| 4. 多套方案 + 详述 + 二次修改 | `api/proposals.py` + `core/recommender.py` | `views/proposals.js`（卡片 + 修改框 + 历史） |
| 5. 任务增删改 | `api/tasks.py` | `views/tasks.js`（列表 + 详情 form/json） |
| 6. 任务回顾评价 | `api/reviews.py` | `views/review.js`（时间线 + 表单） |
| 7. 能力值变更建议 + 微调 | `core/ability_updates.py` + `api/ability_updates.py` | `views/ability_updates.js`（按状态分组 + 微调输入） |
| 8. 自由对话 | `api/chat.py` | `views/chat.js`（全局浮动面板） |
| 9. H5 + 11011 端口可配置 | `backend/main.py` 读 `config.json` | `frontend/` 静态挂载 |

## 10. 启动与运行

```bash
pip install -r requirements.txt
python -m backend.main
# -> http://127.0.0.1:11011/
```

首次启动会自动生成包含设计文档样例（`emp_001/002/003/005`、`task_042` 等）的 `database.json`。

## 11. 后续扩展建议

- 把 `database.json` 切换为 SQLite / DuckDB，仍保持单文件迁移特性的同时获得索引能力。
- 为自由对话增加 OpenAI tools / function calling，由用户授权后允许 AI 直接调用业务接口。
- 沉淀更多协作模式（结对、轮换、外包）作为 `recommender` 的可配置策略。
- 为冲刺周期视图补一个简报页（设计 §7），目前数据结构已就绪，只缺前端展示。
