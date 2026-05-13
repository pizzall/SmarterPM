/* 人员实时状态面板（§3.1 P2）：每人当前负载 + 在哪些任务里 + 发起的任务。 */
window.Views = window.Views || {};
window.Views.peopleStatus = (function () {
  async function render(main) {
    const data = (await API.get("/api/employees")).data || [];
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "人员实时状态"),
      UI.el(
        "span",
        { class: "page-subtitle" },
        "基于当前进行中（active）任务的方案成员聚合"
      ),
    ]));

    // 概览
    const summary = UI.el("div", { class: "people-summary" });
    const idle = data.filter((e) => (e._load?.level || "idle") === "idle");
    const normal = data.filter((e) => e._load?.level === "normal");
    const over = data.filter((e) => e._load?.level === "overload");
    summary.appendChild(summaryCard("空闲", idle.length, "idle"));
    summary.appendChild(summaryCard("常规", normal.length, "normal"));
    summary.appendChild(summaryCard("过载", over.length, "overload"));
    wrap.appendChild(summary);

    // 卡片网格
    const grid = UI.el("div", { class: "people-grid" });
    data
      .slice()
      .sort((a, b) => (b._load?.active_task_count || 0) - (a._load?.active_task_count || 0))
      .forEach((emp) => grid.appendChild(personCard(emp)));
    wrap.appendChild(grid);

    main.appendChild(wrap);
  }

  function summaryCard(label, count, level) {
    const el = UI.el("div", { class: `summary-card load-${level}` });
    el.innerHTML = `<div class="summary-num">${count}</div><div class="summary-label">${UI.escape(
      label
    )}</div>`;
    return el;
  }

  function personCard(emp) {
    const load = emp._load || { active_task_count: 0, active_tasks: [], level: "idle" };
    const card = UI.el("div", { class: `person-card load-${load.level}` });
    const topSkill = (emp.skills || [])
      .slice()
      .sort((a, b) => (b.level || 0) - (a.level || 0))[0];
    card.innerHTML = `
      <div class="person-head">
        <a class="person-name" href="#/employees/${encodeURIComponent(emp.id)}">${UI.escape(
      emp.name || ""
    )}</a>
        <span class="person-id">${UI.escape(emp.id)}</span>
        <span class="badge load-badge load-${load.level}">${load.active_task_count} 任务</span>
      </div>
      <div class="person-meta">
        <span>${UI.escape((emp.departments || []).map(Components.deptPicker.nameOf).join(" / ") || "—")}</span>
        ${topSkill ? `<span class="badge badge-info">${UI.escape(topSkill.tag)} Lv${topSkill.level}</span>` : ""}
        ${emp.role_tendency ? `<span class="role-badge role-${UI.escape(emp.role_tendency)}">${UI.escape(Meta.enumLabel ? Meta.enumLabel("role_tendency", emp.role_tendency) : emp.role_tendency)}</span>` : ""}
      </div>
    `;
    if ((load.active_tasks || []).length) {
      const ul = UI.el("ul", { class: "person-tasks" });
      load.active_tasks.forEach((t) => {
        const li = UI.el("li");
        const progress = t.progress != null ? ` · ${t.progress}%` : "";
        li.innerHTML = `<a href="#/tasks/${encodeURIComponent(t.task_id)}">${UI.escape(
          t.title || t.task_id
        )}</a> <span class="role-badge role-${UI.escape(t.role || "")}">${UI.escape(
          Meta.enumLabel ? Meta.enumLabel("role_tendency", t.role) : t.role || ""
        )}</span>${UI.escape(progress)}`;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    } else {
      card.appendChild(UI.el("div", { class: "muted" }, "当前空闲"));
    }
    return card;
  }

  return { render };
})();
