/* 能力值变更提案审批（需求 7，UX §5.6 改写）。 */
window.Views = window.Views || {};
window.Views.abilityUpdates = (function () {
  async function render(main) {
    const all = (await API.get("/api/ability-updates")).data || [];
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "能力值变更提案"),
      UI.el("span", { class: "page-subtitle" }, "来自方案二次修改 / 任务回顾"),
    ]));

    if (!all.length) {
      wrap.appendChild(UI.el("div", { class: "panel" }, [
        UI.el("div", { class: "empty" }, "暂无提案。提交方案修改或任务回顾后会自动生成。"),
      ]));
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
      const header = UI.el("div", { class: "page-header" });
      header.appendChild(
        UI.el(
          "h3",
          { class: "page-title", style: "font-size:16px;" },
          `${labelOf(k)}（${list.length}）`
        )
      );
      if (k === "pending" || k === "edited") {
        const actions = UI.el("div");
        const all = UI.el("button", { class: "btn" }, "全部应用");
        all.onclick = async () => {
          if (!confirm(`将应用 ${list.length} 条提案，确定？`)) return;
          await bulk(list, "apply");
          await render(main);
        };
        const allR = UI.el("button", { class: "btn btn-danger" }, "全部拒绝");
        allR.onclick = async () => {
          if (!confirm(`将拒绝 ${list.length} 条提案，确定？`)) return;
          await bulk(list, "reject");
          await render(main);
        };
        actions.appendChild(all);
        actions.appendChild(allR);
        header.appendChild(actions);
      }
      panel.appendChild(header);
      list.forEach((p) => panel.appendChild(card(p, main)));
      wrap.appendChild(panel);
    });

    main.appendChild(wrap);
  }

  async function bulk(items, action) {
    for (const p of items) {
      try {
        await API.post(
          `/api/ability-updates/${encodeURIComponent(p.id)}/${action}`
        );
      } catch (e) {
        UI.showToast(e.message, "error");
      }
    }
    UI.showToast(`已${action === "apply" ? "全部应用" : "全部拒绝"}`, "success");
  }

  function labelOf(k) {
    return { pending: "待审", edited: "已修改", applied: "已应用", rejected: "已拒绝" }[k];
  }

  function friendlyField(field) {
    if (!field) return "";
    const m = field.match(/^skill:(.+)$/);
    if (m) return `技能 - ${m[1]}`;
    const dict = {
      communication: "沟通能力",
      responsibility: "责任度",
      growth_rate: "成长速度",
      performance_trend: "绩效趋势",
      role_tendency: "角色倾向",
      mbti: "MBTI",
    };
    return dict[field] || field;
  }

  function card(p, main) {
    const div = UI.el("div", { class: "proposal-card" });
    const name = Components.employeePicker.nameOf(p.employee_id);
    div.innerHTML = `
      <div><b>${UI.escape(name)}</b> · 字段 <span class="badge badge-info">${UI.escape(
      friendlyField(p.field)
    )}</span> · 来源 <span class="badge">${UI.escape(p.source || "")}</span></div>
      <div class="muted">${UI.escape(p.created_at || "")}</div>
      <div class="kvp">
        <div><span class="k">原值</span><span class="v">${UI.escape(
          String(p.old_value ?? "—")
        )}</span></div>
        <div><span class="k">建议值</span><span class="v">${UI.escape(
          String(p.proposed_value ?? "—")
        )}</span></div>
        <div><span class="k">理由</span><span class="v">${UI.escape(p.reason || "")}</span></div>
        <div><span class="k">输入</span><span class="v">${UI.escape(p.input_text || "")}</span></div>
      </div>
    `;
    if (p.status === "pending" || p.status === "edited") {
      const editRow = UI.el("div", { class: "ability-edit-row" });
      const isNumeric = typeof p.proposed_value === "number" || /skill:/.test(p.field) || ["communication","responsibility","growth_rate"].includes(p.field);
      let getValue;
      if (isNumeric) {
        const sliderWrap = UI.el("div", { style: "flex:1;" });
        const ctrl = Components.slider.mount(sliderWrap, {
          value: Number(p.proposed_value) || 0,
          min: 0,
          max: 5,
          step: 0.01,
          labels: ["很差", "较差", "一般", "不错", "很好"],
          allowEmpty: false,
        });
        editRow.appendChild(sliderWrap);
        getValue = () => ctrl.getValue();
      } else {
        const inp = UI.el("input", { value: String(p.proposed_value ?? "") });
        editRow.appendChild(inp);
        getValue = () => inp.value;
      }

      const apply = UI.el("button", { class: "btn btn-primary" }, "应用");
      const edit = UI.el("button", { class: "btn" }, "微调保存");
      const rej = UI.el("button", { class: "btn btn-danger" }, "拒绝");
      apply.onclick = async () => {
        try {
          await API.post(
            `/api/ability-updates/${encodeURIComponent(p.id)}/apply`
          );
          UI.showToast("已应用", "success");
          await Meta.refresh().catch(()=>null);
          await render(main);
        } catch (e) { UI.showToast(e.message, "error"); }
      };
      edit.onclick = async () => {
        const v = getValue();
        const numeric = Number(v);
        const proposed = isNumeric ? numeric : (isNaN(numeric) ? v : numeric);
        try {
          await API.patch(
            `/api/ability-updates/${encodeURIComponent(p.id)}`,
            { proposed_value: proposed }
          );
          UI.showToast("已保存修改", "success", { detail: `建议值 ${proposed}` });
          await render(main);
        } catch (e) { UI.showToast(e.message, "error"); }
      };
      rej.onclick = async () => {
        try {
          await API.post(
            `/api/ability-updates/${encodeURIComponent(p.id)}/reject`
          );
          await render(main);
        } catch (e) { UI.showToast(e.message, "error"); }
      };
      editRow.appendChild(edit);
      editRow.appendChild(apply);
      editRow.appendChild(rej);
      div.appendChild(editRow);
    }
    return div;
  }

  return { render };
})();
