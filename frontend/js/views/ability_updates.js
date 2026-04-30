/* 能力值变更提案审批（需求 7）。 */
window.Views = window.Views || {};
window.Views.abilityUpdates = (function () {
  async function render(main) {
    const all = (await API.get("/api/ability-updates")).data || [];
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "能力值变更提案"),
      UI.el("span", { class: "page-subtitle" }, "需求 7：来自方案二次修改 / 任务回顾"),
    ]));

    if (!all.length) {
      wrap.appendChild(UI.el("div", { class: "panel" }, [UI.el("div", { class: "empty" }, "暂无提案。提交方案修改或任务回顾后会自动生成。")]));
      main.appendChild(wrap);
      return;
    }

    const groups = {
      pending: all.filter((p) => p.status === "pending"),
      edited: all.filter((p) => p.status === "edited"),
      applied: all.filter((p) => p.status === "applied"),
      rejected: all.filter((p) => p.status === "rejected"),
    };

    Object.entries(groups).forEach(([k, list]) => {
      if (!list.length) return;
      const panel = UI.el("div", { class: "panel" });
      panel.appendChild(UI.el("h3", {}, `${labelOf(k)}（${list.length}）`));
      list.forEach((p) => panel.appendChild(card(p)));
      wrap.appendChild(panel);
    });

    main.appendChild(wrap);
  }

  function labelOf(k) {
    return { pending: "待审", edited: "已修改", applied: "已应用", rejected: "已拒绝" }[k];
  }

  function card(p) {
    const div = UI.el("div", { class: "proposal-card" });
    div.innerHTML = `
      <div><b>${UI.escape(p.employee_id)}</b> · 字段 <span class="badge badge-info">${UI.escape(p.field)}</span> · 来源 <span class="badge">${UI.escape(p.source || "")}</span></div>
      <div class="muted">${UI.escape(p.created_at || "")}</div>
      <div class="kvp">
        <div><span class="k">原值</span><span class="v">${UI.escape(String(p.old_value ?? "—"))}</span></div>
        <div><span class="k">建议值</span><span class="v">${UI.escape(String(p.proposed_value ?? "—"))}</span></div>
        <div><span class="k">理由</span><span class="v">${UI.escape(p.reason || "")}</span></div>
        <div><span class="k">输入</span><span class="v">${UI.escape(p.input_text || "")}</span></div>
      </div>
    `;
    if (p.status === "pending" || p.status === "edited") {
      const adjust = UI.el("input", { value: p.proposed_value, style: "max-width:120px" });
      const apply = UI.el("button", { class: "btn btn-primary" }, "应用");
      const edit = UI.el("button", { class: "btn" }, "微调保存");
      const rej = UI.el("button", { class: "btn btn-danger" }, "拒绝");
      apply.onclick = async () => {
        try { await API.post(`/api/ability-updates/${encodeURIComponent(p.id)}/apply`); UI.showToast("已应用", "success"); location.hash = "#/ability-updates"; window.location.reload(); }
        catch (e) { UI.showToast(e.message, "error"); }
      };
      edit.onclick = async () => {
        const v = adjust.value;
        const numeric = Number(v);
        const proposed = isNaN(numeric) ? v : numeric;
        try { await API.patch(`/api/ability-updates/${encodeURIComponent(p.id)}`, { proposed_value: proposed }); UI.showToast("已保存修改", "success"); window.location.reload(); }
        catch (e) { UI.showToast(e.message, "error"); }
      };
      rej.onclick = async () => {
        try { await API.post(`/api/ability-updates/${encodeURIComponent(p.id)}/reject`); window.location.reload(); }
        catch (e) { UI.showToast(e.message, "error"); }
      };
      div.appendChild(UI.el("div", { class: "actions-row" }, [
        UI.el("span", { class: "muted" }, "微调建议值："), adjust, edit, apply, rej,
      ]));
    }
    return div;
  }

  return { render };
})();
