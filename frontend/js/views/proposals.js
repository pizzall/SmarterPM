/* 任务多套方案展示 + 二次修改（需求 4，UX §5.4 改写）。 */
window.Views = window.Views || {};
window.Views.proposals = (function () {
  const QUICK_INSTRUCTIONS = [
    "强化沟通能力",
    "降低跨部门成本",
    "替换为更资深的成员",
    "成员负载更均衡",
  ];

  async function render(main, taskId) {
    const t = (await API.get(`/api/tasks/${encodeURIComponent(taskId)}`)).data;
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, `推荐方案 · ${t.title}`),
      UI.el("div", {}, [
        UI.el(
          "button",
          { class: "btn btn-primary", onClick: () => generate(taskId) },
          "生成 / 重新生成方案"
        ),
        UI.el("a", { class: "btn", href: `#/tasks/${encodeURIComponent(taskId)}` }, "返回任务"),
        UI.el("a", { class: "btn", href: `#/tasks/${encodeURIComponent(taskId)}/review` }, "查看回顾"),
      ]),
    ]));

    // 冲突检测警告
    try {
      const conf = await API.get(
        `/api/tasks/${encodeURIComponent(taskId)}/conflicts`
      );
      const items = (conf.data && conf.data.conflicts) || [];
      if (items.length) {
        const bar = UI.el("div", { class: "conflict-bar" });
        bar.innerHTML = `<b>资源冲突警告：</b> ${items
          .map(
            (c) =>
              `${UI.escape(c.name || c.employee_id)} 已在 ${UI.escape(
                (c.other_tasks || []).join("、")
              )} 中`
          )
          .join("； ")}`;
        wrap.appendChild(bar);
      }
    } catch {
      /* 后端可能尚未提供该接口；阶段三补全 */
    }

    if (!(t.proposals || []).length) {
      wrap.appendChild(
        UI.el("div", { class: "empty" }, "尚未生成方案，点击右上角「生成方案」开始")
      );
    } else {
      // 顶部并列对比
      if (t.proposals.length > 1) {
        const compare = UI.el("div", { class: "proposal-compare" });
        t.proposals.forEach((p) => compare.appendChild(compareCard(p, t)));
        wrap.appendChild(compare);
      }
      // 详细可编辑卡片
      const list = UI.el("div");
      t.proposals.forEach((p) => list.appendChild(renderProposal(p, taskId)));
      wrap.appendChild(list);
    }
    main.appendChild(wrap);
  }

  function memberLabel(empId) {
    return Components.employeePicker.nameOf(empId);
  }

  function compareCard(p, task) {
    const card = UI.el("div", { class: "compare-card" });
    card.appendChild(
      UI.el(
        "div",
        { class: "compare-title" },
        `${p.title || "方案"} v${p.version || 1}`
      )
    );
    const memWrap = UI.el("div");
    (p.members || []).forEach((m) => {
      const span = UI.el("div", { class: "compare-member" });
      span.innerHTML = `<b>${UI.escape(
        memberLabel(m.employee_id)
      )}</b><span class="role-badge role-${UI.escape(m.role || "")}">${UI.escape(
        Meta.enumLabel ? Meta.enumLabel("role_tendency", m.role) : m.role || ""
      )}</span>`;
      memWrap.appendChild(span);
    });
    card.appendChild(memWrap);
    if (p.advantages)
      card.appendChild(UI.el("div", { class: "compare-line" }, `✓ ${p.advantages}`));
    if (p.risks)
      card.appendChild(UI.el("div", { class: "compare-line muted" }, `⚠ ${p.risks}`));
    return card;
  }

  function renderProposal(p, taskId) {
    const card = UI.el("div", { class: "proposal-card" });
    card.appendChild(
      UI.el(
        "h3",
        {},
        `方案 ${p.id} v${p.version || 1} · ${p.title || ""}`
      )
    );
    const kvp = UI.el("div", { class: "kvp" });
    kvp.innerHTML = `
      <div><span class="k">团队适配</span><span class="v">${UI.escape(p.team_fit || "—")}</span></div>
      <div><span class="k">优势</span><span class="v">${UI.escape(p.advantages || "—")}</span></div>
      <div><span class="k">风险</span><span class="v">${UI.escape(p.risks || "—")}</span></div>
      <div><span class="k">跨部门</span><span class="v">${UI.escape(p.cross_dept_notes || "—")}</span></div>
    `;
    card.appendChild(kvp);

    card.appendChild(UI.el("h4", {}, "成员"));
    const memList = UI.el("ul", { class: "members" });
    (p.members || []).forEach((m, idx) => {
      const li = UI.el("li");
      const name = memberLabel(m.employee_id);
      const roleLabel = Meta.enumLabel
        ? Meta.enumLabel("role_tendency", m.role)
        : m.role;
      li.innerHTML = `<b>${UI.escape(name)}</b><span class="role-badge role-${UI.escape(
        m.role || ""
      )}">${UI.escape(roleLabel || "")}</span> · <span class="muted">${UI.escape(
        m.reason || ""
      )}</span> <button class="btn proposal-edit" data-idx="${idx}">替换</button>`;
      memList.appendChild(li);
    });
    card.appendChild(memList);
    memList.querySelectorAll(".proposal-edit").forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        const m = (p.members || [])[idx];
        if (m) openMemberEditor(p, m, idx, taskId);
      };
    });

    // 自由意见
    const ta = UI.el("textarea", {
      class: "json-input",
      style: "min-height:80px;",
      placeholder:
        "示例：把张三换成李四，因为他更熟悉数据库迁移；强化沟通能力",
    });
    const quick = UI.el("div", { class: "quick-instructions" });
    QUICK_INSTRUCTIONS.forEach((s) => {
      const b = UI.el("button", { class: "btn" }, s);
      b.onclick = () => {
        ta.value = ta.value ? `${ta.value}；${s}` : s;
      };
      quick.appendChild(b);
    });
    const submit = UI.el("button", { class: "btn btn-primary" }, "提交修改意见");
    submit.onclick = () => modify(p, taskId, ta.value.trim());
    card.appendChild(UI.el("h4", {}, "修改意见"));
    card.appendChild(quick);
    card.appendChild(ta);
    card.appendChild(UI.el("div", { class: "actions-row" }, [submit]));

    if ((p.modifications || []).length) {
      const det = UI.el("details");
      det.appendChild(
        UI.el("summary", {}, `历史修改 ${p.modifications.length} 次`)
      );
      p.modifications.slice().reverse().forEach((mod) => {
        const div = UI.el("div", { class: "muted" });
        div.innerHTML = `<b>${UI.escape(mod.ts)}</b><br>意见：${UI.escape(
          mod.instruction
        )}<br>说明：${UI.escape(mod.diff_explanation || "")}`;
        det.appendChild(div);
      });
      card.appendChild(det);
    }
    return card;
  }

  function openMemberEditor(p, member, idx, taskId) {
    const modal = UI.el("div", { class: "modal-backdrop" });
    const dlg = UI.el("div", { class: "modal-dialog" });
    dlg.appendChild(UI.el("h3", {}, "替换成员"));
    dlg.appendChild(
      UI.el(
        "div",
        { class: "muted" },
        `当前：${memberLabel(member.employee_id)} · 角色 ${
          Meta.enumLabel
            ? Meta.enumLabel("role_tendency", member.role)
            : member.role || ""
        }`
      )
    );

    const empField = Components.field.create("替换为", { required: true });
    const empWrap = UI.el("div");
    const empCtrl = Components.employeePicker.mount(empWrap, {
      value: null,
      allowEmpty: false,
    });
    empField.body.appendChild(empWrap);
    dlg.appendChild(empField.root);

    const reasonField = Components.field.create("替换理由", {
      help: "AI 将基于该理由重新生成方案",
    });
    const reasonArea = UI.el("textarea", {
      rows: "3",
      placeholder: "例如：他更熟悉数据库迁移",
    });
    reasonField.body.appendChild(reasonArea);
    dlg.appendChild(reasonField.root);

    const actions = UI.el("div", { class: "actions-row" });
    const cancel = UI.el("button", { class: "btn" }, "取消");
    cancel.onclick = () => modal.remove();
    const ok = UI.el("button", { class: "btn btn-primary" }, "提交");
    ok.onclick = () => {
      const targetId = empCtrl.getValue();
      if (!targetId) {
        empField.setError("请选择员工");
        return;
      }
      const targetName = memberLabel(targetId);
      const reason = reasonArea.value.trim();
      const instruction = `把 ${memberLabel(
        member.employee_id
      )} 替换为 ${targetName}${reason ? "，理由：" + reason : ""}`;
      modal.remove();
      modify(p, taskId, instruction);
    };
    actions.appendChild(cancel);
    actions.appendChild(ok);
    dlg.appendChild(actions);
    modal.appendChild(dlg);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
  }

  async function modify(p, taskId, instruction) {
    if (!instruction) {
      UI.showToast("请填写修改意见", "error");
      return;
    }
    try {
      const res = await API.post(
        `/api/tasks/${encodeURIComponent(taskId)}/proposals/${encodeURIComponent(
          p.id
        )}/modify`,
        { instruction }
      );
      UI.showToast("方案已修改", "success");
      if ((res.data.ability_proposals || []).length) {
        UI.showToast(
          `生成 ${res.data.ability_proposals.length} 条能力值变更建议，请到「能力值待审」查看`,
          "info"
        );
      }
      location.hash = `#/tasks/${encodeURIComponent(taskId)}/proposals`;
    } catch (e) { UI.showToast(e.message, "error"); }
  }

  async function generate(taskId) {
    try {
      UI.showToast("正在生成方案…", "info");
      await API.post(
        `/api/tasks/${encodeURIComponent(taskId)}/proposals/generate`
      );
      location.hash = `#/tasks/${encodeURIComponent(taskId)}/proposals`;
      UI.showToast("方案已生成", "success");
    } catch (e) { UI.showToast(e.message, "error"); }
  }

  return { render };
})();
