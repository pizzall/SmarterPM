/* 任务状态看板：草稿 / 进行中 / 已完成 / 归档 四列，支持拖拽改 status。 */
window.Views = window.Views || {};
window.Views.board = (function () {
  const COLS = ["draft", "active", "done", "archived"];

  async function render(main) {
    const tasks = (await API.get("/api/tasks")).data || [];
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "任务看板"),
      UI.el(
        "span",
        { class: "page-subtitle" },
        "拖拽卡片到目标列以快速更新状态"
      ),
    ]));

    if (!tasks.length) {
      wrap.appendChild(
        UI.el(
          "div",
          { class: "empty" },
          "暂无任务，去 [任务规划] 创建第一个"
        )
      );
      main.appendChild(wrap);
      return;
    }

    const board = UI.el("div", { class: "board" });
    const grouped = Object.fromEntries(COLS.map((c) => [c, []]));
    tasks.forEach((t) => {
      const k = COLS.includes(t.status) ? t.status : "draft";
      grouped[k].push(t);
    });
    // 按优先级排序
    const prioOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    Object.values(grouped).forEach((arr) =>
      arr.sort(
        (a, b) =>
          (prioOrder[a.priority] ?? 2) - (prioOrder[b.priority] ?? 2)
      )
    );

    COLS.forEach((status) => {
      const col = UI.el("div", { class: "board-col" });
      col.dataset.status = status;
      const label = Meta.enumLabel
        ? Meta.enumLabel("task_status", status)
        : status;
      col.appendChild(
        UI.el(
          "div",
          { class: "board-col-head" },
          `${label}（${grouped[status].length}）`
        )
      );
      const list = UI.el("div", { class: "board-list" });
      grouped[status].forEach((t) => list.appendChild(card(t)));
      col.appendChild(list);

      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        col.classList.add("drop-target");
      });
      col.addEventListener("dragleave", () =>
        col.classList.remove("drop-target")
      );
      col.addEventListener("drop", async (e) => {
        e.preventDefault();
        col.classList.remove("drop-target");
        const taskId = e.dataTransfer.getData("text/plain");
        if (!taskId) return;
        const task = tasks.find((t) => t.id === taskId);
        if (!task || task.status === status) return;
        try {
          await API.put(`/api/tasks/${encodeURIComponent(taskId)}`, {
            ...task,
            status,
          });
          UI.showToast(`已移到「${label}」`, "success", {
            detail: task.title,
          });
          await render(main);
        } catch (err) { UI.showToast(err.message, "error"); }
      });

      board.appendChild(col);
    });
    wrap.appendChild(board);
    main.appendChild(wrap);
  }

  function card(t) {
    const div = UI.el("div", { class: "board-card", draggable: "true" });
    div.dataset.taskId = t.id;
    const prio = t.priority
      ? `<span class="badge priority-${UI.escape(t.priority)}">${UI.escape(
          Meta.enumLabel ? Meta.enumLabel("priority", t.priority) : t.priority
        )}</span>`
      : "";
    const cx = t.complexity
      ? `<span class="badge badge-info">${UI.escape(
          Meta.enumLabel ? Meta.enumLabel("complexity", t.complexity) : t.complexity
        )}</span>`
      : "";
    const progress =
      t.progress != null
        ? `<div class="board-progress"><span style="width:${Math.min(
            100,
            Math.max(0, Number(t.progress) || 0)
          )}%"></span></div>`
        : "";
    div.innerHTML = `
      <div class="board-card-title"><a href="#/tasks/${encodeURIComponent(t.id)}">${UI.escape(
      t.title
    )}</a></div>
      <div class="board-card-meta">${cx} ${prio}</div>
      ${progress}
      <div class="board-card-skills">${(t.required_skills || [])
        .slice(0, 4)
        .map((s) => `<span class="cmp-tag">${UI.escape(s)}</span>`)
        .join("")}</div>
    `;
    div.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", t.id);
      div.classList.add("dragging");
    });
    div.addEventListener("dragend", () => div.classList.remove("dragging"));
    return div;
  }

  return { render };
})();
