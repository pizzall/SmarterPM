/* 通知中心视图 + 顶栏未读数轮询。 */
window.Views = window.Views || {};
window.Views.notifications = (function () {
  const KIND_LABEL = {
    task_created: "新任务",
    task_status: "状态变更",
    proposal_finalize: "方案 finalize",
    proposal_modified: "方案修改",
    review_added: "新回顾",
    ability_pending: "能力值待审",
    progress_update: "进度更新",
    info: "提示",
  };

  async function render(main) {
    const data = (await API.get("/api/notifications?limit=100")).data || [];
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "通知中心"),
      UI.el("div", {}, [
        UI.el("button", { class: "btn", id: "ntf-mark-all" }, "全部已读"),
      ]),
    ]));

    if (!data.length) {
      wrap.appendChild(UI.el("div", { class: "empty" }, "暂无通知"));
      main.appendChild(wrap);
      return;
    }

    const list = UI.el("div");
    data.forEach((n) => list.appendChild(item(n, main)));
    wrap.appendChild(list);
    main.appendChild(wrap);

    document.getElementById("ntf-mark-all").onclick = async () => {
      await API.post("/api/notifications/mark_read", { ids: [], all: true });
      await refreshBadge();
      render(main);
    };
  }

  function item(n, main) {
    const div = UI.el("div", {
      class: "notif-item" + (n.read ? " read" : ""),
    });
    const kindLabel = KIND_LABEL[n.kind] || n.kind;
    div.innerHTML = `
      <div class="notif-row">
        <span class="badge">${UI.escape(kindLabel)}</span>
        <span class="notif-title">${UI.escape(n.title)}</span>
        <span class="muted notif-time">${UI.escape(n.created_at || "")}</span>
      </div>
      ${n.body ? `<div class="notif-body">${UI.escape(n.body)}</div>` : ""}
    `;
    const actions = UI.el("div", { class: "actions-row" });
    if (n.link) {
      const open = UI.el("a", { class: "btn", href: n.link }, "查看");
      open.onclick = async () => {
        if (!n.read) {
          await API.post("/api/notifications/mark_read", {
            ids: [n.id],
            all: false,
          });
          await refreshBadge();
        }
      };
      actions.appendChild(open);
    }
    if (!n.read) {
      const mk = UI.el("button", { class: "btn" }, "标记已读");
      mk.onclick = async () => {
        await API.post("/api/notifications/mark_read", {
          ids: [n.id],
          all: false,
        });
        await refreshBadge();
        render(main);
      };
      actions.appendChild(mk);
    }
    const del = UI.el("button", { class: "btn btn-danger" }, "删除");
    del.onclick = async () => {
      await API.del(`/api/notifications/${encodeURIComponent(n.id)}`);
      await refreshBadge();
      render(main);
    };
    actions.appendChild(del);
    div.appendChild(actions);
    return div;
  }

  async function refreshBadge() {
    try {
      const res = await API.get("/api/notifications/unread_count");
      const count = (res.data && res.data.count) || 0;
      const dot = document.getElementById("nav-notif-dot");
      if (!dot) return;
      if (count > 0) {
        dot.textContent = count > 99 ? "99+" : String(count);
        dot.classList.remove("hidden");
      } else {
        dot.classList.add("hidden");
      }
    } catch {
      /* 静默失败 */
    }
  }

  function startPolling() {
    refreshBadge();
    setInterval(refreshBadge, 30000);
  }

  return { render, refreshBadge, startPolling };
})();
