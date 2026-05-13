/* 主路由 + 顶栏交互 */
(function () {
  const main = document.getElementById("app-main");

  const routes = {
    "/org": () => Views.org.render(main),
    "/employees": () => Views.employees.render(main),
    "/employees/:id": (id) => Views.employees.render(main, { detail: id }),
    "/tasks": () => Views.tasks.render(main),
    "/tasks/:id": (id) => Views.tasks.render(main, { detail: id }),
    "/tasks/:id/proposals": (id) => Views.proposals.render(main, id),
    "/tasks/:id/review": (id) => Views.review.render(main, id),
    "/planning": () => Views.planning.render(main),
    "/planning/:cid": (cid) => Views.planning.render(main, cid),
    "/ability-updates": () => Views.abilityUpdates.render(main),
    "/people-status": () => Views.peopleStatus.render(main),
    "/board": () => Views.board.render(main),
    "/sprints": () => Views.sprints.render(main),
    "/notifications": () => Views.notifications.render(main),
  };

  function matchRoute(hash) {
    const path = (hash || "#/org").replace(/^#/, "");
    const segs = path.split("/").filter(Boolean);
    for (const pattern of Object.keys(routes)) {
      const ps = pattern.split("/").filter(Boolean);
      if (ps.length !== segs.length) continue;
      const params = [];
      let ok = true;
      for (let i = 0; i < ps.length; i++) {
        if (ps[i].startsWith(":")) params.push(decodeURIComponent(segs[i]));
        else if (ps[i] !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler: routes[pattern], params, key: ps[0] };
    }
    return { handler: routes["/org"], params: [], key: "org" };
  }

  function highlightNav(key) {
    document.querySelectorAll(".nav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.view === key);
    });
  }

  function navigate() {
    const { handler, params, key } = matchRoute(window.location.hash);
    main.innerHTML = '<div class="loading">加载中…</div>';
    if (window.Components && Components.skeleton) {
      Components.skeleton.list(main, 5);
    }
    highlightNav(key);
    Promise.resolve()
      .then(() => Meta.ensure().catch(() => null))
      .then(() => handler(...params))
      .catch((err) => {
        console.error(err);
        main.innerHTML = `<div class="panel"><div class="empty">加载失败：${UI.escape(err.message)}</div></div>`;
        UI.showToast(err.message, "error");
      });
  }

  function applyTheme(theme) {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = t;
    const btn = document.getElementById("btn-theme");
    if (btn) btn.textContent = t === "dark" ? "浅色" : "深色";
    try { localStorage.setItem("smarterpm.theme", t); } catch (e) {}
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("smarterpm.theme"); } catch (e) {}
    if (saved) {
      applyTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  initTheme();

  window.addEventListener("hashchange", navigate);
  window.addEventListener("DOMContentLoaded", () => {
    const themeBtn = document.getElementById("btn-theme");
    if (themeBtn) {
      themeBtn.onclick = () => {
        const cur = document.documentElement.dataset.theme || "light";
        applyTheme(cur === "dark" ? "light" : "dark");
      };
      themeBtn.textContent =
        (document.documentElement.dataset.theme || "light") === "dark"
          ? "浅色"
          : "深色";
    }

    if (!window.location.hash) window.location.hash = "#/org";
    else navigate();

    document.getElementById("btn-export").onclick = async () => {
      try {
        const blob = await API.download("/api/database/export");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "database.json";
        a.click();
        URL.revokeObjectURL(url);
        UI.showToast("数据库已导出", "success");
      } catch (e) {
        UI.showToast(e.message, "error");
      }
    };

    document.getElementById("btn-import").onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      if (!confirm("将用上传文件覆盖当前数据库（旧库会自动备份），确定继续？")) {
        ev.target.value = "";
        return;
      }
      try {
        await API.upload("/api/database/import", file);
        UI.showToast("数据库已导入", "success");
        await Meta.refresh().catch(() => null);
        navigate();
      } catch (e) {
        UI.showToast(e.message, "error");
      } finally {
        ev.target.value = "";
      }
    };

    document.getElementById("btn-reset").onclick = async () => {
      if (!confirm("将重置为内置示例数据（旧库自动备份）。确定继续？")) return;
      try {
        await API.post("/api/database/reset");
        UI.showToast("已重置", "success");
        await Meta.refresh().catch(() => null);
        navigate();
      } catch (e) {
        UI.showToast(e.message, "error");
      }
    };

    Views.chat.bind();
    bindShortcuts();
    bindGlobalSearch();
    if (Views.notifications && Views.notifications.startPolling) {
      Views.notifications.startPolling();
    }
  });

  function bindGlobalSearch() {
    const inp = document.getElementById("global-search");
    const panel = document.getElementById("global-search-panel");
    if (!inp || !panel) return;
    let tasksCache = [];
    let tasksLoadedAt = 0;

    async function loadTasks() {
      const now = Date.now();
      if (tasksCache.length && now - tasksLoadedAt < 30000) return tasksCache;
      try {
        const res = await API.get("/api/tasks");
        tasksCache = res.data || [];
        tasksLoadedAt = now;
      } catch {
        /* ignore */
      }
      return tasksCache;
    }

    function paint(q) {
      panel.innerHTML = "";
      const qq = q.trim().toLowerCase();
      if (!qq) {
        panel.classList.add("hidden");
        return;
      }
      const employees = Meta.employees();
      const skills = Meta.skills();
      const depts = Meta.departments();

      const empHits = employees
        .filter((e) =>
          `${e.name} ${e.id} ${e.top_skill || ""}`.toLowerCase().includes(qq)
        )
        .slice(0, 5);
      const taskHits = tasksCache
        .filter((t) =>
          `${t.title} ${t.id} ${(t.required_skills || []).join(" ")}`
            .toLowerCase()
            .includes(qq)
        )
        .slice(0, 5);
      const skillHits = skills
        .filter((s) => s.tag.toLowerCase().includes(qq))
        .slice(0, 5);
      const deptHits = depts
        .filter((d) => `${d.name} ${d.path || ""}`.toLowerCase().includes(qq))
        .slice(0, 5);

      function addGroup(title, items, render) {
        if (!items.length) return;
        const g = UI.el("div", { class: "gs-group" });
        g.appendChild(UI.el("div", { class: "gs-group-title" }, title));
        items.forEach((it) => {
          const li = UI.el("a", { class: "gs-item", href: render(it).href });
          li.innerHTML = render(it).html;
          g.appendChild(li);
        });
        panel.appendChild(g);
      }

      addGroup("员工", empHits, (e) => ({
        href: `#/employees/${encodeURIComponent(e.id)}`,
        html: `<b>${UI.escape(e.name)}</b><span class="muted">${UI.escape(
          e.id
        )}${e.top_skill ? " · " + UI.escape(e.top_skill) : ""}</span>`,
      }));
      addGroup("任务", taskHits, (t) => ({
        href: `#/tasks/${encodeURIComponent(t.id)}`,
        html: `<b>${UI.escape(t.title)}</b><span class="muted">${UI.escape(
          t.id
        )} · ${UI.escape(t.status || "")}</span>`,
      }));
      addGroup("技能", skillHits, (s) => ({
        href: `#/employees`,
        html: `<b>${UI.escape(s.tag)}</b><span class="muted">出现 ${
          s.count || 0
        } 次</span>`,
      }));
      addGroup("部门", deptHits, (d) => ({
        href: `#/org`,
        html: `<b>${UI.escape(d.name)}</b><span class="muted">${UI.escape(
          d.path || d.id
        )}</span>`,
      }));

      if (!panel.children.length) {
        panel.appendChild(UI.el("div", { class: "gs-empty" }, "无匹配项"));
      }
      panel.classList.remove("hidden");
    }

    inp.addEventListener("input", () => {
      loadTasks();
      paint(inp.value);
    });
    inp.addEventListener("focus", () => {
      loadTasks();
      if (inp.value) paint(inp.value);
    });
    document.addEventListener("click", (e) => {
      if (!inp.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.add("hidden");
      }
    });
    document.addEventListener("keydown", (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        inp.focus();
        inp.select();
      }
    });
  }

  function bindShortcuts() {
    document.addEventListener("keydown", (e) => {
      const meta = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd + S 触发当前页可见的保存按钮
      if (meta && (e.key === "s" || e.key === "S")) {
        const main = document.getElementById("app-main");
        const btn =
          (main &&
            main.querySelector(
              'button[data-form-save]:not([disabled]), button.btn-primary:not([disabled])'
            )) ||
          null;
        if (btn) {
          e.preventDefault();
          btn.click();
          return;
        }
      }
      // ESC 关闭顶部 modal-backdrop / chat-panel
      if (e.key === "Escape") {
        const m = document.querySelector(".modal-backdrop");
        if (m) {
          m.remove();
          e.preventDefault();
          return;
        }
        const chat = document.getElementById("chat-panel");
        if (chat && !chat.classList.contains("hidden")) {
          chat.classList.add("hidden");
          e.preventDefault();
        }
      }
    });
  }
})();
