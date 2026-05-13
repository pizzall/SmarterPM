/* Sprint 简报视图：按 sprint_id 聚合任务，提供进度统计。 */
window.Views = window.Views || {};
window.Views.sprints = (function () {
  async function render(main) {
    const tasks = (await API.get("/api/tasks")).data || [];
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "Sprint 简报"),
      UI.el(
        "span",
        { class: "page-subtitle" },
        "按 sprint_id 聚合任务、进度与回顾摘要"
      ),
    ]));

    const sprints = Meta.sprints();
    const groupBy = new Map();
    tasks.forEach((t) => {
      const sid = t.sprint_id || "（未分配）";
      if (!groupBy.has(sid)) groupBy.set(sid, []);
      groupBy.get(sid).push(t);
    });

    if (!sprints.length && groupBy.size === 1 && groupBy.has("（未分配）")) {
      wrap.appendChild(
        UI.el("div", { class: "empty" }, "尚无 Sprint，可在任务编辑页设置 sprint_id")
      );
      main.appendChild(wrap);
      return;
    }

    // 先呈现已存在的 Sprint
    sprints.forEach((sp) => {
      wrap.appendChild(sprintPanel(sp, groupBy.get(sp.id) || []));
      groupBy.delete(sp.id);
    });
    // 再呈现未分配的
    groupBy.forEach((arr, sid) => {
      wrap.appendChild(
        sprintPanel({ id: sid, start_date: "", duration_weeks: null }, arr)
      );
    });

    main.appendChild(wrap);
  }

  function sprintPanel(sp, taskList) {
    const panel = UI.el("div", { class: "panel sprint-panel" });
    const stats = computeStats(taskList);
    panel.appendChild(
      UI.el(
        "div",
        { class: "page-header" },
        [
          UI.el("h3", { class: "page-title", style: "font-size:16px;" }, [
            UI.el(
              "span",
              {},
              sp.id +
                (sp.start_date ? `（${sp.start_date}` : "") +
                (sp.duration_weeks ? ` · ${sp.duration_weeks} 周）` : sp.start_date ? "）" : "")
            ),
          ]),
          UI.el(
            "span",
            { class: "muted" },
            `${taskList.length} 任务 · 平均进度 ${stats.avgProgress}%`
          ),
        ]
      )
    );

    const progress = UI.el("div", { class: "sprint-progress" });
    progress.innerHTML = `
      <div class="sprint-progress-bar">
        <span class="sp-done" style="width:${stats.done}%"></span>
        <span class="sp-active" style="width:${stats.active}%"></span>
        <span class="sp-draft" style="width:${stats.draft}%"></span>
      </div>
      <div class="sprint-progress-legend">
        <span><i class="sp-dot done"></i>已完成 ${stats.doneCount}</span>
        <span><i class="sp-dot active"></i>进行中 ${stats.activeCount}</span>
        <span><i class="sp-dot draft"></i>草稿 ${stats.draftCount}</span>
        ${stats.archivedCount ? `<span><i class="sp-dot archived"></i>归档 ${stats.archivedCount}</span>` : ""}
      </div>
    `;
    panel.appendChild(progress);

    if (!taskList.length) {
      panel.appendChild(UI.el("div", { class: "muted" }, "暂无任务"));
      return panel;
    }
    const table = UI.el("table", { class: "table" });
    table.innerHTML = `<thead><tr><th>任务</th><th>状态</th><th>优先级</th><th>进度</th><th>方案</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector("tbody");
    taskList.forEach((t) => {
      const tr = UI.el("tr");
      const st = Meta.enumLabel ? Meta.enumLabel("task_status", t.status) : t.status;
      const prio = t.priority
        ? `<span class="badge priority-${UI.escape(t.priority)}">${UI.escape(
            Meta.enumLabel ? Meta.enumLabel("priority", t.priority) : t.priority
          )}</span>`
        : "—";
      const prog = t.progress != null ? `${t.progress}%` : "—";
      tr.innerHTML = `
        <td><a href="#/tasks/${encodeURIComponent(t.id)}">${UI.escape(t.title)}</a></td>
        <td><span class="badge">${UI.escape(st || "")}</span></td>
        <td>${prio}</td>
        <td>${UI.escape(prog)}</td>
        <td>${(t.proposals || []).length}</td>
      `;
      tbody.appendChild(tr);
    });
    panel.appendChild(table);

    return panel;
  }

  function computeStats(tasks) {
    if (!tasks.length) {
      return {
        avgProgress: 0,
        done: 0, active: 0, draft: 0,
        doneCount: 0, activeCount: 0, draftCount: 0, archivedCount: 0,
      };
    }
    const counts = { draft: 0, active: 0, done: 0, archived: 0 };
    let sum = 0;
    tasks.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
      sum += Number(t.progress) || 0;
    });
    const total = tasks.length;
    return {
      avgProgress: Math.round(sum / total),
      done: Math.round((counts.done / total) * 100),
      active: Math.round((counts.active / total) * 100),
      draft: Math.round((counts.draft / total) * 100),
      doneCount: counts.done,
      activeCount: counts.active,
      draftCount: counts.draft,
      archivedCount: counts.archived,
    };
  }

  return { render };
})();
