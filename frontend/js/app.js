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
    highlightNav(key);
    Promise.resolve()
      .then(() => handler(...params))
      .catch((err) => {
        console.error(err);
        main.innerHTML = `<div class="panel"><div class="empty">加载失败：${UI.escape(err.message)}</div></div>`;
        UI.showToast(err.message, "error");
      });
  }

  window.addEventListener("hashchange", navigate);
  window.addEventListener("DOMContentLoaded", () => {
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
        navigate();
      } catch (e) {
        UI.showToast(e.message, "error");
      }
    };

    Views.chat.bind();
  });
})();
