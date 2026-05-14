/* 全局自由对话浮窗（需求 8）。
 * 增强：可拖动、可缩放、历史会话、上下文保留、单条消息删除。
 * 持久化：会话主体 → 后端 database.json.conversations；窗口几何 + 当前会话 ID → localStorage。
 */
window.Views = window.Views || {};
window.Views.chat = (function () {
  const LS_KEYS = {
    geom: "smarterpm.chat.geom",
    cid: "smarterpm.chat.current_cid",
    side: "smarterpm.chat.sidebar_open",
  };
  const MIN_W = 320;
  const MIN_H = 360;
  const KEEP_VISIBLE = 80;

  const state = {
    cid: null,
    messages: [],
    conversations: [],
    sidebarOpen: false,
    loaded: false,
  };

  let dom = {};

  function readGeom() {
    try {
      const raw = localStorage.getItem(LS_KEYS.geom);
      if (!raw) return null;
      const g = JSON.parse(raw);
      if (
        g &&
        typeof g.left === "number" &&
        typeof g.top === "number" &&
        typeof g.width === "number" &&
        typeof g.height === "number"
      ) return g;
    } catch (_) {}
    return null;
  }

  function writeGeom() {
    if (!dom.panel) return;
    const g = {
      left: dom.panel.offsetLeft,
      top: dom.panel.offsetTop,
      width: dom.panel.offsetWidth,
      height: dom.panel.offsetHeight,
    };
    try { localStorage.setItem(LS_KEYS.geom, JSON.stringify(g)); } catch (_) {}
  }

  function clampGeom(g) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(g.width || MIN_W, MIN_W), Math.floor(vw * 0.95));
    const height = Math.min(Math.max(g.height || MIN_H, MIN_H), Math.floor(vh * 0.92));
    const left = Math.min(Math.max(g.left, -(width - KEEP_VISIBLE)), vw - KEEP_VISIBLE);
    const top = Math.min(Math.max(g.top, 0), vh - KEEP_VISIBLE);
    return { left, top, width, height };
  }

  function applyGeom(g) {
    if (!dom.panel) return;
    const c = clampGeom(g);
    dom.panel.style.left = c.left + "px";
    dom.panel.style.top = c.top + "px";
    dom.panel.style.right = "auto";
    dom.panel.style.bottom = "auto";
    dom.panel.style.width = c.width + "px";
    dom.panel.style.height = c.height + "px";
    dom.panel.classList.add("is-positioned");
  }

  function ensureGeom() {
    const saved = readGeom();
    if (saved) {
      applyGeom(saved);
      return;
    }
    const width = 420;
    const height = 560;
    const left = Math.max(16, window.innerWidth - width - 32);
    const top = Math.max(16, window.innerHeight - height - 80);
    applyGeom({ left, top, width, height });
  }

  function bindDrag() {
    const handle = dom.dragHandle;
    if (!handle) return;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = dom.panel.offsetLeft;
      const startTop = dom.panel.offsetTop;
      document.body.classList.add("chat-dragging");
      const onMove = (ev) => {
        const nx = startLeft + (ev.clientX - startX);
        const ny = startTop + (ev.clientY - startY);
        applyGeom({
          left: nx,
          top: ny,
          width: dom.panel.offsetWidth,
          height: dom.panel.offsetHeight,
        });
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.classList.remove("chat-dragging");
        writeGeom();
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  function bindResize() {
    const h = dom.resize;
    if (!h) return;
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = dom.panel.offsetWidth;
      const startH = dom.panel.offsetHeight;
      const startLeft = dom.panel.offsetLeft;
      const startTop = dom.panel.offsetTop;
      document.body.classList.add("chat-resizing");
      const onMove = (ev) => {
        const nw = startW + (ev.clientX - startX);
        const nh = startH + (ev.clientY - startY);
        applyGeom({ left: startLeft, top: startTop, width: nw, height: nh });
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.classList.remove("chat-resizing");
        writeGeom();
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  function renderMessages() {
    const box = dom.messages;
    if (!box) return;
    if (!state.messages.length) {
      box.innerHTML = '<div class="chat-msg assistant"><div class="role">AI</div><div class="bubble">你好，我可以基于当前组织 / 任务 / 方案数据回答问题或给出建议。例如：\n· 张三最近适合参与什么任务？\n· task_042 的方案有什么风险？\n· 建议把 emp_005 的沟通调高</div></div>';
      return;
    }
    box.innerHTML = "";
    state.messages.forEach((m, idx) => {
      const role = m.role === "user" ? "user" : "assistant";
      const node = UI.el("div", { class: `chat-msg ${role}`, "data-idx": String(idx) });
      const roleLabel = role === "user" ? "我" : "AI";
      const content = UI.escape(m.content || "");
      node.innerHTML = `<div class="role">${roleLabel}</div><div class="bubble">${content}</div><button class="chat-msg-del" title="删除该消息" data-idx="${idx}">×</button>`;
      box.appendChild(node);
    });
    box.scrollTop = box.scrollHeight;
  }

  function append(role, content) {
    state.messages.push({ role, content });
    renderMessages();
  }

  function renderSidebar() {
    const list = dom.list;
    if (!list) return;
    if (!state.conversations.length) {
      list.innerHTML = '<div class="chat-conversation-empty">暂无历史会话</div>';
      return;
    }
    list.innerHTML = "";
    state.conversations.forEach((c) => {
      const item = UI.el("div", {
        class: "chat-conversation-item" + (c.id === state.cid ? " active" : ""),
        "data-cid": c.id,
      });
      const preview = c.preview || "(空会话)";
      const updated = (c.updated_at || "").slice(0, 16).replace("T", " ");
      item.innerHTML = `
        <div class="conv-preview">${UI.escape(preview)}</div>
        <div class="conv-meta">
          <span>${UI.escape(updated)}</span>
          <span>${c.message_count} 条</span>
        </div>
        <button class="conv-del" title="删除会话" data-cid="${c.id}">×</button>
      `;
      list.appendChild(item);
    });
  }

  async function loadConversations() {
    try {
      const res = await API.get("/api/chat/conversations");
      state.conversations = res.data || [];
    } catch (err) {
      state.conversations = [];
    }
    renderSidebar();
  }

  async function switchTo(cid) {
    if (!cid) return;
    try {
      const res = await API.get(`/api/chat/conversations/${cid}`);
      state.cid = cid;
      state.messages = (res.data && res.data.messages) || [];
      try { localStorage.setItem(LS_KEYS.cid, cid); } catch (_) {}
      renderMessages();
      renderSidebar();
    } catch (err) {
      UI.showToast("会话加载失败：" + err.message, "error");
    }
  }

  async function deleteConversation(cid) {
    if (!cid) return;
    if (!window.confirm("确定删除整个会话？此操作不可撤销。")) return;
    try {
      await API.del(`/api/chat/conversations/${cid}`);
      state.conversations = state.conversations.filter((c) => c.id !== cid);
      if (state.cid === cid) {
        state.cid = null;
        state.messages = [];
        try { localStorage.removeItem(LS_KEYS.cid); } catch (_) {}
        renderMessages();
      }
      renderSidebar();
      UI.showToast("会话已删除", "success");
    } catch (err) {
      UI.showToast("删除失败：" + err.message, "error");
    }
  }

  async function deleteMessage(idx) {
    if (!state.cid) return;
    try {
      await API.del(`/api/chat/conversations/${state.cid}/messages/${idx}`);
      state.messages.splice(idx, 1);
      renderMessages();
      const conv = state.conversations.find((c) => c.id === state.cid);
      if (conv) conv.message_count = Math.max(0, (conv.message_count || 1) - 1);
      renderSidebar();
    } catch (err) {
      UI.showToast("删除失败：" + err.message, "error");
    }
  }

  function newConversation() {
    state.cid = null;
    state.messages = [];
    try { localStorage.removeItem(LS_KEYS.cid); } catch (_) {}
    renderMessages();
    renderSidebar();
  }

  function toggleSidebar(open) {
    state.sidebarOpen = typeof open === "boolean" ? open : !state.sidebarOpen;
    if (state.sidebarOpen) {
      dom.sidebar.classList.remove("hidden");
    } else {
      dom.sidebar.classList.add("hidden");
    }
    try { localStorage.setItem(LS_KEYS.side, state.sidebarOpen ? "1" : "0"); } catch (_) {}
  }

  async function openPanel() {
    dom.panel.classList.remove("hidden");
    ensureGeom();
    if (!state.loaded) {
      state.loaded = true;
      const sideRaw = (() => {
        try { return localStorage.getItem(LS_KEYS.side); } catch (_) { return null; }
      })();
      toggleSidebar(sideRaw === "1");
      await loadConversations();
      let restoreCid = null;
      try { restoreCid = localStorage.getItem(LS_KEYS.cid); } catch (_) {}
      if (restoreCid && state.conversations.some((c) => c.id === restoreCid)) {
        await switchTo(restoreCid);
      } else {
        renderMessages();
      }
    }
  }

  function closePanel() {
    dom.panel.classList.add("hidden");
  }

  async function submit(e) {
    e.preventDefault();
    const text = dom.input.value.trim();
    if (!text) return;
    dom.input.value = "";
    append("user", text);
    try {
      const payload = { user_message: text };
      if (state.cid) {
        payload.conversation_id = state.cid;
      } else {
        payload.new_conversation = true;
      }
      const res = await API.post("/api/chat", payload);
      const newCid = res.data && res.data.conversation_id;
      if (newCid) {
        const isNew = newCid !== state.cid;
        state.cid = newCid;
        try { localStorage.setItem(LS_KEYS.cid, newCid); } catch (_) {}
        if (isNew) await loadConversations();
      }
      append("assistant", res.data.reply || "(无回复)");
      if ((res.data.suggested_actions || []).length) {
        append(
          "assistant",
          "建议操作：\n" + res.data.suggested_actions.map((a, i) => `${i + 1}. ${a.summary}`).join("\n")
        );
      }
      const conv = state.conversations.find((c) => c.id === state.cid);
      if (conv) {
        conv.message_count = state.messages.length;
        conv.preview = (state.messages.find((m) => m.role === "user") || {}).content || "";
        if (conv.preview.length > 30) conv.preview = conv.preview.slice(0, 30) + "…";
        conv.updated_at = new Date().toISOString();
        state.conversations.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
        renderSidebar();
      }
    } catch (err) {
      append("assistant", "出错：" + err.message);
    }
  }

  function bind() {
    dom = {
      fab: document.getElementById("chat-fab"),
      panel: document.getElementById("chat-panel"),
      dragHandle: document.getElementById("chat-drag-handle"),
      close: document.getElementById("chat-close"),
      newBtn: document.getElementById("chat-new"),
      clearBtn: document.getElementById("chat-clear"),
      toggleHistory: document.getElementById("chat-toggle-history"),
      sidebar: document.getElementById("chat-sidebar"),
      list: document.getElementById("chat-conversation-list"),
      messages: document.getElementById("chat-messages"),
      form: document.getElementById("chat-form"),
      input: document.getElementById("chat-input"),
      resize: document.getElementById("chat-resize"),
    };
    if (!dom.panel) return;

    dom.fab.onclick = () => {
      if (dom.panel.classList.contains("hidden")) {
        openPanel();
      } else {
        closePanel();
      }
    };
    dom.close.onclick = closePanel;
    dom.newBtn.onclick = newConversation;
    dom.clearBtn.onclick = () => {
      if (!state.cid) {
        UI.showToast("当前没有可删除的会话", "info");
        return;
      }
      deleteConversation(state.cid);
    };
    dom.toggleHistory.onclick = () => toggleSidebar();

    dom.list.addEventListener("click", (e) => {
      const delBtn = e.target.closest(".conv-del");
      if (delBtn) {
        e.stopPropagation();
        deleteConversation(delBtn.getAttribute("data-cid"));
        return;
      }
      const item = e.target.closest(".chat-conversation-item");
      if (item) {
        const cid = item.getAttribute("data-cid");
        if (cid && cid !== state.cid) switchTo(cid);
      }
    });

    dom.messages.addEventListener("click", (e) => {
      const del = e.target.closest(".chat-msg-del");
      if (del) {
        const idx = parseInt(del.getAttribute("data-idx"), 10);
        if (!Number.isNaN(idx)) deleteMessage(idx);
      }
    });

    dom.form.onsubmit = submit;

    bindDrag();
    bindResize();

    window.addEventListener("resize", () => {
      if (!dom.panel.classList.contains("is-positioned")) return;
      const g = {
        left: dom.panel.offsetLeft,
        top: dom.panel.offsetTop,
        width: dom.panel.offsetWidth,
        height: dom.panel.offsetHeight,
      };
      applyGeom(g);
    });
  }

  return { bind, openPanel, closePanel };
})();
