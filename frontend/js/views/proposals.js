/* 任务多套方案展示 + 二次修改（需求 4）。 */
window.Views = window.Views || {};
window.Views.proposals = (function () {
  async function render(main, taskId) {
    const t = (await API.get(`/api/tasks/${encodeURIComponent(taskId)}`)).data;
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, `推荐方案 · ${t.title}`),
      UI.el("div", {}, [
        UI.el("button", { class: "btn btn-primary", onClick: () => generate(taskId) }, "生成 / 重新生成方案"),
        UI.el("a", { class: "btn", href: `#/tasks/${encodeURIComponent(taskId)}` }, "返回任务"),
        UI.el("a", { class: "btn", href: `#/tasks/${encodeURIComponent(taskId)}/review` }, "查看回顾"),
      ]),
    ]));

    const list = UI.el("div", { id: "props-list" });
    if (!(t.proposals || []).length) {
      list.appendChild(UI.el("div", { class: "empty" }, "尚未生成方案，点击右上角「生成方案」开始"));
    } else {
      t.proposals.forEach((p) => list.appendChild(renderProposal(p, taskId)));
    }
    wrap.appendChild(list);
    main.appendChild(wrap);
  }

  function renderProposal(p, taskId) {
    const card = UI.el("div", { class: "proposal-card" });
    card.innerHTML = `
      <h3>方案 ${UI.escape(p.id)} v${p.version || 1} · ${UI.escape(p.title || "")}</h3>
      <div class="kvp">
        <div><span class="k">团队适配</span><span class="v">${UI.escape(p.team_fit || "—")}</span></div>
        <div><span class="k">优势</span><span class="v">${UI.escape(p.advantages || "—")}</span></div>
        <div><span class="k">风险</span><span class="v">${UI.escape(p.risks || "—")}</span></div>
        <div><span class="k">跨部门</span><span class="v">${UI.escape(p.cross_dept_notes || "—")}</span></div>
      </div>
      <h4>成员</h4>
      <ul class="members"></ul>
    `;
    const ul = card.querySelector("ul");
    (p.members || []).forEach((m) => {
      const li = UI.el("li");
      li.innerHTML = `<b>${UI.escape(m.employee_id)}</b> · 角色 ${UI.escape(m.role || "—")} · ${UI.escape(m.reason || "")}`;
      ul.appendChild(li);
    });

    const ta = UI.el("textarea", { class: "json-input", style: "min-height:80px;", placeholder: "示例：把张三换成李四，因为他更熟悉数据库迁移；强化沟通能力" });
    const submit = UI.el("button", { class: "btn btn-primary" }, "提交修改意见");
    submit.onclick = async () => {
      const ins = ta.value.trim();
      if (!ins) return UI.showToast("请填写修改意见", "error");
      try {
        const res = await API.post(`/api/tasks/${encodeURIComponent(taskId)}/proposals/${encodeURIComponent(p.id)}/modify`, { instruction: ins });
        UI.showToast("方案已修改", "success");
        if ((res.data.ability_proposals || []).length) {
          UI.showToast(`生成 ${res.data.ability_proposals.length} 条能力值变更建议，请到「能力值待审」查看`, "info");
        }
        location.hash = `#/tasks/${encodeURIComponent(taskId)}/proposals`;
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    card.appendChild(UI.el("h4", {}, "修改意见"));
    card.appendChild(ta);
    card.appendChild(UI.el("div", { class: "actions-row" }, [submit]));

    if ((p.modifications || []).length) {
      const det = UI.el("details");
      det.appendChild(UI.el("summary", {}, `历史修改 ${p.modifications.length} 次`));
      p.modifications.slice().reverse().forEach((mod) => {
        const div = UI.el("div", { class: "muted" });
        div.innerHTML = `<b>${UI.escape(mod.ts)}</b><br>意见：${UI.escape(mod.instruction)}<br>说明：${UI.escape(mod.diff_explanation || "")}`;
        det.appendChild(div);
      });
      card.appendChild(det);
    }
    return card;
  }

  async function generate(taskId) {
    try {
      UI.showToast("正在生成方案…", "info");
      await API.post(`/api/tasks/${encodeURIComponent(taskId)}/proposals/generate`);
      location.hash = `#/tasks/${encodeURIComponent(taskId)}/proposals`;
      UI.showToast("方案已生成", "success");
    } catch (e) { UI.showToast(e.message, "error"); }
  }

  return { render };
})();
