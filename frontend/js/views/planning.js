/* 任务规划 + 多轮对话（需求 3，UX §5.3 改写）。 */
window.Views = window.Views || {};
window.Views.planning = (function () {
  let state = { cid: null, draft: null, history: [] };

  async function render(main, cid) {
    state = { cid: cid || null, draft: null, history: [] };
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "任务规划"),
      UI.el("span", { class: "page-subtitle" }, "自然语言描述 → 二次澄清 → 预览 → finalize"),
    ]));

    const grid = UI.el("div", { class: "grid-eq" });
    grid.appendChild(buildLeft());
    grid.appendChild(buildRight());
    wrap.appendChild(grid);
    main.appendChild(wrap);

    if (cid) {
      try {
        const conv = (await API.get(`/api/planning/${encodeURIComponent(cid)}`)).data;
        state.cid = conv.id;
        state.draft = conv.draft || null;
        state.history = conv.messages || [];
        repaint();
      } catch (e) { UI.showToast(e.message, "error"); }
    }
  }

  function buildLeft() {
    const left = UI.el("div", { class: "panel" });
    left.appendChild(UI.el("h3", {}, "对话区"));

    const log = UI.el("div", {
      id: "plan-log",
      style:
        "min-height:280px; max-height:380px; overflow:auto; border:1px solid var(--border); border-radius:6px; padding:8px; background:var(--panel-soft);",
    });
    left.appendChild(log);

    const ta = UI.el("textarea", {
      id: "plan-input",
      class: "json-input",
      style: "min-height:100px;",
    });
    ta.placeholder =
      "首条：用一段话描述任务（例如：把用户中心拆分成微服务架构……）\n后续：可补充时间限制、关键人选、风险偏好等";
    left.appendChild(ta);

    const send = UI.el("button", { class: "btn btn-primary" }, "发送");
    send.onclick = () => sendMessage(ta);
    left.appendChild(UI.el("div", { class: "actions-row" }, [send]));
    return left;
  }

  async function sendMessage(ta) {
    const text = ta.value.trim();
    if (!text) return;
    ta.value = "";
    try {
      let res;
      if (!state.cid) {
        res = await API.post("/api/planning/start", { description: text });
        state.cid = res.data.conversation_id;
        state.history.push({ role: "user", content: text });
        state.history.push({
          role: "assistant",
          content: "（已生成任务草稿，可在右侧查看）",
        });
        state.draft = res.data.draft;
        history.replaceState(
          null,
          "",
          `#/planning/${encodeURIComponent(state.cid)}`
        );
      } else {
        res = await API.post(
          `/api/planning/${encodeURIComponent(state.cid)}/refine`,
          { user_message: text }
        );
        state.history.push({ role: "user", content: text });
        state.history.push({ role: "assistant", content: res.data.reply });
        state.draft = res.data.draft;
      }
      if (res.ai_status === "degraded") {
        UI.showToast("LLM 离线，已用规则模式生成", "info");
      }
      repaint();
    } catch (e) { UI.showToast(e.message, "error"); }
  }

  function buildRight() {
    const right = UI.el("div", { class: "panel" });
    right.appendChild(UI.el("h3", {}, "任务草稿"));
    right.appendChild(
      UI.el("div", { id: "plan-draft" }, [
        UI.el("div", { class: "muted" }, "尚未生成草稿"),
      ])
    );

    const finBtn = UI.el(
      "button",
      { class: "btn btn-primary", id: "plan-final" },
      "Finalize 为任务"
    );
    finBtn.disabled = true;
    finBtn.onclick = () => previewAndFinalize();
    right.appendChild(UI.el("div", { class: "actions-row" }, [finBtn]));
    return right;
  }

  function repaint() {
    const log = document.getElementById("plan-log");
    log.innerHTML = "";
    state.history.forEach((m) => {
      const div = UI.el("div", { class: `chat-msg ${m.role}` });
      div.innerHTML = `<div class="role">${
        m.role === "user" ? "我" : "AI"
      }</div><div class="bubble">${UI.escape(m.content)}</div>`;
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;

    const draftDiv = document.getElementById("plan-draft");
    draftDiv.innerHTML = "";
    if (!state.draft) {
      draftDiv.appendChild(UI.el("div", { class: "muted" }, "尚未生成草稿"));
    } else {
      paintDraftCard(draftDiv, state.draft);
    }

    const finBtn = document.getElementById("plan-final");
    if (finBtn) finBtn.disabled = !state.draft;
  }

  function paintDraftCard(container, d) {
    const card = UI.el("div", { class: "draft-card" });
    card.appendChild(UI.el("div", { class: "draft-title" }, d.title || "未命名"));
    if (d.description) {
      card.appendChild(UI.el("div", { class: "draft-desc" }, d.description));
    }

    const meta = UI.el("div", { class: "draft-meta" });
    const cxLabel = Meta.enumLabel
      ? Meta.enumLabel("complexity", d.complexity)
      : d.complexity;
    if (d.complexity) {
      meta.appendChild(
        UI.el(
          "span",
          { class: "badge badge-info" },
          `复杂度：${cxLabel || d.complexity}`
        )
      );
    }
    if (d.duration_weeks) {
      meta.appendChild(
        UI.el("span", { class: "badge" }, `周期：${d.duration_weeks} 周`)
      );
    }
    card.appendChild(meta);

    if ((d.required_skills || []).length) {
      const skWrap = UI.el("div", { class: "draft-section" });
      skWrap.appendChild(UI.el("div", { class: "draft-section-title" }, "技能"));
      const tags = UI.el("div");
      d.required_skills.forEach((s) => {
        tags.appendChild(UI.el("span", { class: "cmp-tag" }, s));
      });
      skWrap.appendChild(tags);
      card.appendChild(skWrap);
    }

    if (d.required_roles && Object.keys(d.required_roles).length) {
      const rcWrap = UI.el("div", { class: "draft-section" });
      rcWrap.appendChild(UI.el("div", { class: "draft-section-title" }, "角色配置"));
      Object.entries(d.required_roles).forEach(([k, v]) => {
        const lbl =
          (Meta.enumLabel ? Meta.enumLabel("role_tendency", k) : k) + ` × ${v}`;
        rcWrap.appendChild(UI.el("span", { class: `role-badge role-${k}` }, lbl));
      });
      card.appendChild(rcWrap);
    }

    if ((d.clarifying_questions || []).length) {
      const cq = UI.el("div", { class: "draft-section draft-cq" });
      cq.appendChild(
        UI.el("div", { class: "draft-section-title" }, "AI 想确认的问题")
      );
      d.clarifying_questions.forEach((q) => {
        const btn = UI.el(
          "button",
          { class: "btn draft-cq-btn", type: "button" },
          `· ${q}`
        );
        btn.onclick = () => {
          const ta = document.getElementById("plan-input");
          if (ta) {
            ta.value = ta.value
              ? `${ta.value}\n${q}`
              : `针对这个问题补充说明：${q}\n`;
            ta.focus();
          }
        };
        cq.appendChild(btn);
      });
      card.appendChild(cq);
    }

    container.appendChild(card);
  }

  function previewAndFinalize() {
    if (!state.cid || !state.draft) return;
    const d = state.draft;
    const modal = UI.el("div", { class: "modal-backdrop" });
    const dlg = UI.el("div", { class: "modal-dialog" });
    dlg.appendChild(UI.el("h3", {}, "确认创建任务"));
    paintDraftCard(dlg, d);

    const titleField = Components.field.create("任务标题（可改）", {
      help: Help.get("task.title"),
    });
    const titleInput = UI.el("input");
    titleInput.value = d.title || "";
    titleField.body.appendChild(titleInput);
    dlg.appendChild(titleField.root);

    const spField = Components.field.create("Sprint", {
      help: Help.get("task.sprint_id"),
    });
    const spWrap = UI.el("div");
    const spCtrl = Components.sprintPicker.mount(spWrap, {
      value: d.sprint_id || null,
    });
    spField.body.appendChild(spWrap);
    dlg.appendChild(spField.root);

    const actions = UI.el("div", { class: "actions-row" });
    const cancel = UI.el("button", { class: "btn" }, "取消");
    cancel.onclick = () => modal.remove();
    const confirm = UI.el("button", { class: "btn btn-primary" }, "确认创建");
    confirm.onclick = async () => {
      try {
        const res = await API.post(
          `/api/planning/${encodeURIComponent(state.cid)}/finalize`,
          {
            title: titleInput.value.trim() || d.title,
            sprint_id: spCtrl.getValue() || null,
          }
        );
        modal.remove();
        UI.showToast("任务已创建", "success", {
          detail: res.data.title,
        });
        await Meta.refresh().catch(()=>null);
        location.hash = `#/tasks/${encodeURIComponent(res.data.id)}`;
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    dlg.appendChild(actions);
    modal.appendChild(dlg);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
  }

  return { render };
})();
