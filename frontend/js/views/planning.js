/* 任务规划 + 多轮对话（需求 3）。 */
window.Views = window.Views || {};
window.Views.planning = (function () {
  let state = { cid: null, draft: null, history: [] };

  async function render(main, cid) {
    state = { cid: cid || null, draft: null, history: [] };
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "任务规划"),
      UI.el("span", { class: "page-subtitle" }, "需求 3：自然语言描述 → 二次澄清 → finalize 为任务"),
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

    const log = UI.el("div", { id: "plan-log", style: "min-height:280px; max-height:380px; overflow:auto; border:1px solid var(--border); border-radius:6px; padding:8px; background:var(--panel-soft);" });
    left.appendChild(log);

    const ta = UI.el("textarea", { id: "plan-input", class: "json-input", style: "min-height:100px;" });
    ta.placeholder = "首条：用一段话描述任务（例如：把用户中心拆分成微服务架构……）\n后续：可补充时间限制、关键人选、风险偏好等";
    left.appendChild(ta);

    const send = UI.el("button", { class: "btn btn-primary" }, "发送");
    send.onclick = async () => {
      const text = ta.value.trim();
      if (!text) return;
      ta.value = "";
      try {
        let res;
        if (!state.cid) {
          res = await API.post("/api/planning/start", { description: text });
          state.cid = res.data.conversation_id;
          state.history.push({ role: "user", content: text });
          state.history.push({ role: "assistant", content: "（已生成任务草稿，可在右侧查看）" });
          state.draft = res.data.draft;
          history.replaceState(null, "", `#/planning/${encodeURIComponent(state.cid)}`);
        } else {
          res = await API.post(`/api/planning/${encodeURIComponent(state.cid)}/refine`, { user_message: text });
          state.history.push({ role: "user", content: text });
          state.history.push({ role: "assistant", content: res.data.reply });
          state.draft = res.data.draft;
        }
        if (res.ai_status === "degraded") UI.showToast("LLM 离线，已用规则模式生成", "info");
        repaint();
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    left.appendChild(UI.el("div", { class: "actions-row" }, [send]));
    return left;
  }

  function buildRight() {
    const right = UI.el("div", { class: "panel" });
    right.appendChild(UI.el("h3", {}, "任务草稿"));
    right.appendChild(UI.el("div", { id: "plan-draft", class: "kvp" }, [UI.el("div", { class: "muted" }, "尚未生成草稿")]));

    const finBtn = UI.el("button", { class: "btn btn-primary", id: "plan-final" }, "Finalize 为任务");
    finBtn.disabled = true;
    finBtn.onclick = async () => {
      if (!state.cid) return;
      try {
        const res = await API.post(`/api/planning/${encodeURIComponent(state.cid)}/finalize`, {});
        UI.showToast("任务已创建", "success");
        location.hash = `#/tasks/${encodeURIComponent(res.data.id)}`;
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    right.appendChild(UI.el("div", { class: "actions-row" }, [finBtn]));
    return right;
  }

  function repaint() {
    const log = document.getElementById("plan-log");
    log.innerHTML = "";
    state.history.forEach((m) => {
      const div = UI.el("div", { class: `chat-msg ${m.role}` });
      div.innerHTML = `<div class="role">${m.role === "user" ? "我" : "AI"}</div><div class="bubble">${UI.escape(m.content)}</div>`;
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;

    const draftDiv = document.getElementById("plan-draft");
    draftDiv.innerHTML = "";
    if (!state.draft) {
      draftDiv.appendChild(UI.el("div", { class: "muted" }, "尚未生成草稿"));
    } else {
      const d = state.draft;
      const lines = [
        ["标题", d.title],
        ["描述", d.description],
        ["复杂度", d.complexity],
        ["需求技能", (d.required_skills || []).join("、")],
        ["角色需求", JSON.stringify(d.required_roles || {})],
        ["周期(周)", d.duration_weeks],
      ];
      lines.forEach(([k, v]) => {
        draftDiv.innerHTML += `<div><span class="k">${UI.escape(k)}</span><span class="v">${UI.escape(String(v ?? ""))}</span></div>`;
      });
      if ((d.clarifying_questions || []).length) {
        const cq = UI.el("div");
        cq.innerHTML = "<h4>AI 想确认</h4>" + (d.clarifying_questions || []).map((q) => `<div>· ${UI.escape(q)}</div>`).join("");
        draftDiv.appendChild(cq);
      }
    }

    const finBtn = document.getElementById("plan-final");
    if (finBtn) finBtn.disabled = !state.draft;
  }

  return { render };
})();
