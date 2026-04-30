/* 任务列表 + CRUD（需求 5）。 */
window.Views = window.Views || {};
window.Views.tasks = (function () {
  function row(t) {
    const tr = UI.el("tr");
    tr.innerHTML = `
      <td>${UI.escape(t.id)}</td>
      <td><a href="#/tasks/${encodeURIComponent(t.id)}">${UI.escape(t.title)}</a></td>
      <td><span class="badge badge-info">${UI.escape(t.complexity || "")}</span></td>
      <td>${(t.required_skills || []).map(UI.escape).join("、") || "—"}</td>
      <td>${UI.escape(t.status || "")}</td>
      <td>${(t.proposals || []).length}</td>
      <td>${(t.review || []).length}</td>
    `;
    return tr;
  }

  async function renderList(main) {
    const tasks = (await API.get("/api/tasks")).data || [];
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "任务列表"),
      UI.el("button", { class: "btn btn-primary", onClick: () => location.hash = "#/planning" }, "+ 通过对话规划新任务"),
    ]));

    const panel = UI.el("div", { class: "panel" });
    if (!tasks.length) {
      panel.appendChild(UI.el("div", { class: "empty" }, "暂无任务，去 [任务规划] 创建一个"));
    } else {
      const table = UI.el("table", { class: "table" });
      table.innerHTML = `<thead><tr><th>ID</th><th>标题</th><th>复杂度</th><th>需求技能</th><th>状态</th><th>方案</th><th>回顾</th></tr></thead><tbody></tbody>`;
      const tbody = table.querySelector("tbody");
      tasks.forEach((t) => tbody.appendChild(row(t)));
      panel.appendChild(table);
    }
    wrap.appendChild(panel);
    main.appendChild(wrap);
  }

  async function renderDetail(main, taskId) {
    const t = (await API.get(`/api/tasks/${encodeURIComponent(taskId)}`)).data;
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, `任务 · ${t.title}`),
      UI.el("div", {}, [
        UI.el("a", { class: "btn", href: `#/tasks/${encodeURIComponent(taskId)}/proposals` }, "推荐方案"),
        UI.el("a", { class: "btn", href: `#/tasks/${encodeURIComponent(taskId)}/review` }, "回顾评价"),
        UI.el("a", { class: "btn", href: "#/tasks" }, "返回列表"),
      ]),
    ]));

    const panel = UI.el("div", { class: "panel" });
    const tabs = UI.el("div", { class: "tabs" });
    let mode = "form";
    const formBtn = UI.el("button", { class: "active" }, "表单"); formBtn.onclick = () => { mode = "form"; render(); };
    const jsonBtn = UI.el("button", {}, "JSON 原文"); jsonBtn.onclick = () => { mode = "json"; render(); };
    tabs.appendChild(formBtn); tabs.appendChild(jsonBtn);
    panel.appendChild(tabs);

    const body = UI.el("div");
    panel.appendChild(body);

    function render() {
      formBtn.classList.toggle("active", mode === "form");
      jsonBtn.classList.toggle("active", mode === "json");
      body.innerHTML = "";
      if (mode === "json") {
        const ta = UI.el("textarea", { class: "json-input" });
        ta.value = JSON.stringify(t, null, 2);
        body.appendChild(ta);
        const save = UI.el("button", { class: "btn btn-primary" }, "保存 JSON");
        save.onclick = async () => {
          let parsed; try { parsed = JSON.parse(ta.value); } catch { return UI.showToast("JSON 解析失败", "error"); }
          await API.put(`/api/tasks/${encodeURIComponent(taskId)}`, parsed);
          UI.showToast("已保存", "success"); location.hash = `#/tasks/${encodeURIComponent(taskId)}`;
        };
        body.appendChild(UI.el("div", { class: "actions-row" }, [save]));
        return;
      }
      const f = UI.el("div");
      f.appendChild(formRow("标题", "title", t.title));
      f.appendChild(formRow("描述", "description", t.description, "textarea"));
      f.appendChild(formRow("发起人 emp_id", "requester", t.requester || ""));
      f.appendChild(formRow("复杂度 normal/advanced/epic", "complexity", t.complexity || "normal"));
      f.appendChild(formRow("需求技能（逗号分隔）", "required_skills", (t.required_skills || []).join(",")));
      f.appendChild(formRow("角色需求 JSON", "required_roles", JSON.stringify(t.required_roles || {})));
      f.appendChild(formRow("周期（周）", "duration_weeks", t.duration_weeks || 1));
      f.appendChild(formRow("Sprint id", "sprint_id", t.sprint_id || ""));
      f.appendChild(formRow("状态 draft/active/done/archived", "status", t.status || "draft"));

      const save = UI.el("button", { class: "btn btn-primary" }, "保存");
      save.onclick = async () => {
        let roles = {}; try { roles = JSON.parse(f.querySelector('[name="required_roles"]').value || "{}"); }
        catch { return UI.showToast("required_roles 不是合法 JSON", "error"); }
        const payload = {
          title: f.querySelector('[name="title"]').value,
          description: f.querySelector('[name="description"]').value,
          requester: f.querySelector('[name="requester"]').value || null,
          complexity: f.querySelector('[name="complexity"]').value,
          required_skills: f.querySelector('[name="required_skills"]').value.split(",").map((s) => s.trim()).filter(Boolean),
          required_roles: roles,
          duration_weeks: Number(f.querySelector('[name="duration_weeks"]').value) || 1,
          sprint_id: f.querySelector('[name="sprint_id"]').value || null,
          status: f.querySelector('[name="status"]').value || "draft",
        };
        try { await API.put(`/api/tasks/${encodeURIComponent(taskId)}`, payload); UI.showToast("已保存", "success"); location.hash = "#/tasks"; }
        catch (e) { UI.showToast(e.message, "error"); }
      };
      const del = UI.el("button", { class: "btn btn-danger" }, "删除任务");
      del.onclick = async () => {
        if (!confirm("删除任务？方案与回顾会一并删除。")) return;
        await API.del(`/api/tasks/${encodeURIComponent(taskId)}`); location.hash = "#/tasks";
      };
      f.appendChild(UI.el("div", { class: "actions-row" }, [save, del]));
      body.appendChild(f);
    }

    wrap.appendChild(panel);
    main.appendChild(wrap);
    render();
  }

  function formRow(label, name, value, type = "input") {
    const wrap = UI.el("div", { class: "form-row" });
    wrap.appendChild(UI.el("label", {}, label));
    const tag = type === "textarea" ? "textarea" : "input";
    const el = document.createElement(tag);
    el.name = name; el.value = value;
    if (type === "textarea") el.rows = 4;
    wrap.appendChild(el);
    return wrap;
  }

  return {
    render(main, opts = {}) {
      if (opts.detail) return renderDetail(main, opts.detail);
      return renderList(main);
    },
  };
})();
