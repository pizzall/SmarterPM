/* 字段说明文案集中，用于 tooltip。
 * 通过 Help.get("emp.communication") 取出。
 */
window.Help = (function () {
  const dict = {
    // 员工字段
    "emp.name": "员工真实姓名，会在方案、看板等处显示",
    "emp.departments": "员工所属部门，可多选；用于跨部门冲突检测",
    "emp.role_tendency":
      "通常担任的角色定位：Leader 主导 / Executor 执行 / Reviewer 评审",
    "emp.mbti": "MBTI 人格类型，AI 推荐时用于团队互补判断",
    "emp.communication": "沟通能力 1-5：1=很差 / 5=很好；影响跨部门匹配",
    "emp.responsibility": "责任度 1-5：1=经常掉链子 / 5=极可靠",
    "emp.growth_rate": "成长速度 1-5：1=慢 / 5=很快进步",
    "emp.performance_trend": "近期绩效趋势：上升 / 稳定 / 下降",
    "emp.skills":
      "员工掌握的技能及等级。1=入门、3=熟练、5=专家。点击 + 添加技能",
    "emp.work_scope":
      "员工日常负责的工作范围标签，例如：产品规划、需求评审。可自由新增",
    "emp.special_notes": "PM 备忘录，例如：长期请假、家庭情况、偏好任务类型",

    // 任务字段
    "task.title": "任务标题，建议不超过 30 字",
    "task.description": "任务详细描述，AI 会基于此推荐人选",
    "task.requester": "任务发起人，未来用于通知与回收意见",
    "task.complexity":
      "复杂度等级：普通=单部门可完成 / 高级=跨部门 / 史诗=全公司级",
    "task.required_skills":
      "完成任务必需的技能。从技能库选择或输入新技能后回车",
    "task.required_roles":
      "需要的角色数量。Leader 主导 + Executor 执行 + Reviewer 评审",
    "task.duration_weeks": "预计需要的周数",
    "task.sprint_id": "归属的 Sprint（如有），用于 Sprint 简报视图",
    "task.status": "任务状态：草稿 / 进行中 / 已完成 / 归档",
    "task.priority": "优先级：用于看板与列表排序",
    "task.primary_task": "主要任务的一句话总结",
    "task.sub_tasks": "次要任务列表，可分批添加",
    "task.progress": "执行进度 0-100，仅作 PM 跟踪用",

    // 项目组
    "pg.name": "项目组名称",
    "pg.head": "项目组负责人",
    "pg.members": "项目组成员",
    "pg.status": "项目组状态：活跃 / 停用",

    // 回顾
    "review.content": "回顾内容：进展、亮点、问题、人员表现等",
    "review.mood": "整体情绪：积极 / 中性 / 消极",
    "review.author": "回顾撰写人（可选）",
  };

  return {
    get(key) {
      return dict[key] || "";
    },
    set(key, value) {
      dict[key] = value;
    },
    all() {
      return { ...dict };
    },
  };
})();
