/* 部门 / 项目组 / 员工 管理视图（需求 1）。 */
window.Views = window.Views || {};
window.Views.org = (function () {
  let state = { org: null, project_groups: [], employees: {}, selected: null, mode: "form" };

  async function load() {
    const res = await API.get("/api/org");
    state.org = res.data.org;
    state.project_groups = res.data.project_groups || [];
    state.employees = res.data.employees || {};
  }

  function renderTree(node, container, depth = 0) {
    const li = UI.el("li", {
      class: state.selected && state.selected.kind === "dept" && state.selected.id === node.id ? "active" : "",
    });
    li.textContent = `${node.name}（${node.id}）`;
    li.onclick = (e) => {
      e.stopPropagation();
      state.selected = { kind: "dept", id: node.id };
      paint();
    };
    container.appendChild(li);
    if (node.children && node.children.length) {
      const ul = UI.el("ul");
      node.children.forEach((c) => renderTree(c, ul, depth + 1));
      container.appendChild(ul);
    }
  }

  function findDept(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const c of node.children || []) {
      const r = findDept(c, id);
      if (r) return r;
    }
    return null;
  }

  function paint() {
    const root = document.getElementById("org-root");
    if (!root) return;
    const tree = root.querySelector(".tree");
    tree.innerHTML = "";
    if (state.org) renderTree(state.org, tree);

    const pgList = root.querySelector(".pg-list");
    pgList.innerHTML = "";
    (state.project_groups || []).forEach((pg) => {
      const li = UI.el("li", {
        class: state.selected && state.selected.kind === "pg" && state.selected.id === pg.id ? "active" : "",
      });
      li.textContent = `${pg.name}（${pg.id}）`;
      li.onclick = () => { state.selected = { kind: "pg", id: pg.id }; paint(); };
      pgList.appendChild(li);
    });

    const empList = root.querySelector(".emp-list");
    empList.innerHTML = "";
    Object.values(state.employees).forEach((e) => {
      const li = UI.el("li", {
        class: state.selected && state.selected.kind === "emp" && state.selected.id === e.id ? "active" : "",
      });
      li.textContent = `${e.name}（${e.id}）· ${(e.departments || []).join("/")}`;
      li.onclick = () => { state.selected = { kind: "emp", id: e.id }; paint(); };
      empList.appendChild(li);
    });

    paintEditor();
  }

  function paintEditor() {
    const editor = document.getElementById("org-editor");
    if (!editor) return;
    editor.innerHTML = "";
    if (!state.selected) {
      editor.innerHTML = '<div class="empty">在左侧选择部门 / 项目组 / 员工查看编辑</div>';
      return;
    }

    const tabs = UI.el("div", { class: "tabs" });
    ["form", "json"].forEach((mode) => {
      const b = UI.el("button", { class: state.mode === mode ? "active" : "" }, mode === "form" ? "表单" : "JSON 原文");
      b.onclick = () => { state.mode = mode; paintEditor(); };
      tabs.appendChild(b);
    });
    editor.appendChild(tabs);

    const sel = state.selected;
    if (sel.kind === "dept") paintDeptEditor(editor, sel.id);
    else if (sel.kind === "pg") paintPgEditor(editor, sel.id);
    else if (sel.kind === "emp") paintEmpEditor(editor, sel.id);
  }

  function paintDeptEditor(editor, id) {
    const dept = findDept(state.org, id);
    if (!dept) return;
    if (state.mode === "json") {
      paintJsonEditor(editor, dept, async (parsed) => {
        await API.put(`/api/org/dept/${id}`, parsed);
        UI.showToast("部门已更新", "success");
        await load(); paint();
      });
      return;
    }
    const f = UI.el("div");
    f.appendChild(formRow("部门名称", "name", dept.name));
    f.appendChild(formRow("负责人 emp_id", "head", dept.head || ""));

    const save = UI.el("button", { class: "btn btn-primary" }, "保存");
    save.onclick = async () => {
      const payload = {
        name: f.querySelector('[name="name"]').value,
        head: f.querySelector('[name="head"]').value || null,
      };
      try {
        await API.put(`/api/org/dept/${id}`, payload);
        UI.showToast("部门已更新", "success");
        await load(); paint();
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    const addChild = UI.el("button", { class: "btn" }, "添加子部门");
    addChild.onclick = async () => {
      const name = prompt("子部门名称:");
      if (!name) return;
      try {
        await API.post("/api/org/dept", { name, parent_id: id });
        await load(); paint();
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    const del = UI.el("button", { class: "btn btn-danger" }, "删除");
    del.onclick = async () => {
      if (!confirm(`删除部门 ${id}？子部门会一同删除。`)) return;
      try { await API.del(`/api/org/dept/${id}`); state.selected = null; await load(); paint(); }
      catch (e) { UI.showToast(e.message, "error"); }
    };

    const actions = UI.el("div", { class: "actions-row" }, [save, addChild, del]);
    f.appendChild(actions);
    editor.appendChild(f);
  }

  function paintPgEditor(editor, id) {
    const pg = (state.project_groups || []).find((g) => g.id === id);
    if (!pg) return;
    if (state.mode === "json") {
      paintJsonEditor(editor, pg, async (parsed) => {
        await API.put(`/api/org/project-groups/${id}`, parsed);
        await load(); paint();
      });
      return;
    }
    const f = UI.el("div");
    f.appendChild(formRow("名称", "name", pg.name));
    f.appendChild(formRow("负责人 emp_id", "head", pg.head || ""));
    f.appendChild(formRow("成员 emp_id（逗号分隔）", "members", (pg.members || []).join(",")));
    f.appendChild(formRow("状态", "status", pg.status || "active"));
    const save = UI.el("button", { class: "btn btn-primary" }, "保存");
    save.onclick = async () => {
      const payload = {
        name: f.querySelector('[name="name"]').value,
        head: f.querySelector('[name="head"]').value || null,
        members: f.querySelector('[name="members"]').value.split(",").map((s) => s.trim()).filter(Boolean),
        status: f.querySelector('[name="status"]').value,
      };
      try { await API.put(`/api/org/project-groups/${id}`, payload); await load(); paint(); }
      catch (e) { UI.showToast(e.message, "error"); }
    };
    const del = UI.el("button", { class: "btn btn-danger" }, "删除");
    del.onclick = async () => {
      if (!confirm("删除此项目组？")) return;
      await API.del(`/api/org/project-groups/${id}`);
      state.selected = null; await load(); paint();
    };
    f.appendChild(UI.el("div", { class: "actions-row" }, [save, del]));
    editor.appendChild(f);
  }

  function paintEmpEditor(editor, id) {
    const emp = state.employees[id];
    if (!emp) return;
    if (state.mode === "json") {
      paintJsonEditor(editor, emp, async (parsed) => {
        await API.put(`/api/org/employees/${id}`, parsed);
        await load(); paint();
      });
      return;
    }
    const f = UI.el("div");
    f.appendChild(formRow("姓名", "name", emp.name));
    f.appendChild(formRow("部门 id（逗号分隔）", "departments", (emp.departments || []).join(",")));
    f.appendChild(formRow("角色倾向", "role_tendency", emp.role_tendency || ""));
    f.appendChild(formRow("MBTI", "mbti", emp.mbti || ""));
    f.appendChild(formRow("工作范围（逗号分隔）", "work_scope", (emp.work_scope || []).join(",")));
    f.appendChild(formRow("沟通(1-5)", "communication", emp.communication ?? ""));
    f.appendChild(formRow("责任度(1-5)", "responsibility", emp.responsibility ?? ""));
    f.appendChild(formRow("成长速度(1-5)", "growth_rate", emp.growth_rate ?? ""));
    f.appendChild(formRow("绩效趋势 rising/stable/declining", "performance_trend", emp.performance_trend || ""));
    f.appendChild(formRow("技能 JSON 数组", "skills", JSON.stringify(emp.skills || []), "textarea"));
    f.appendChild(formRow("特殊备注", "special_notes", emp.special_notes || "", "textarea"));

    const save = UI.el("button", { class: "btn btn-primary" }, "保存");
    save.onclick = async () => {
      const numOrNull = (s) => s === "" ? null : Number(s);
      let skills = [];
      try { skills = JSON.parse(f.querySelector('[name="skills"]').value || "[]"); }
      catch { return UI.showToast("skills 不是合法 JSON", "error"); }
      const payload = {
        name: f.querySelector('[name="name"]').value,
        departments: f.querySelector('[name="departments"]').value.split(",").map((s) => s.trim()).filter(Boolean),
        role_tendency: f.querySelector('[name="role_tendency"]').value || null,
        mbti: f.querySelector('[name="mbti"]').value || null,
        work_scope: f.querySelector('[name="work_scope"]').value.split(",").map((s) => s.trim()).filter(Boolean),
        communication: numOrNull(f.querySelector('[name="communication"]').value),
        responsibility: numOrNull(f.querySelector('[name="responsibility"]').value),
        growth_rate: numOrNull(f.querySelector('[name="growth_rate"]').value),
        performance_trend: f.querySelector('[name="performance_trend"]').value || null,
        skills,
        special_notes: f.querySelector('[name="special_notes"]').value || null,
      };
      try {
        await API.put(`/api/org/employees/${id}`, payload);
        UI.showToast("员工已更新", "success");
        await load(); paint();
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    const del = UI.el("button", { class: "btn btn-danger" }, "删除");
    del.onclick = async () => {
      if (!confirm(`删除员工 ${id}？`)) return;
      await API.del(`/api/org/employees/${id}`);
      state.selected = null; await load(); paint();
    };
    f.appendChild(UI.el("div", { class: "actions-row" }, [save, del]));
    editor.appendChild(f);
  }

  function paintJsonEditor(editor, obj, onSave) {
    const ta = UI.el("textarea", { class: "json-input" });
    ta.value = JSON.stringify(obj, null, 2);
    editor.appendChild(ta);
    const btn = UI.el("button", { class: "btn btn-primary" }, "提交 JSON");
    btn.onclick = async () => {
      let parsed;
      try { parsed = JSON.parse(ta.value); }
      catch { return UI.showToast("JSON 解析失败", "error"); }
      try { await onSave(parsed); UI.showToast("已保存", "success"); }
      catch (e) { UI.showToast(e.message, "error"); }
    };
    editor.appendChild(UI.el("div", { class: "actions-row" }, [btn]));
  }

  function formRow(label, name, value, type = "input") {
    const wrap = UI.el("div", { class: "form-row" });
    wrap.appendChild(UI.el("label", {}, label));
    const tag = type === "textarea" ? "textarea" : "input";
    const input = document.createElement(tag);
    input.name = name;
    input.value = value;
    wrap.appendChild(input);
    return wrap;
  }

  async function render(main) {
    main.innerHTML = "";
    const wrap = UI.el("div", { id: "org-root" });
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "组织管理"),
      UI.el("span", { class: "page-subtitle" }, "需求 1：部门 / 项目组 / 员工 增删改"),
    ]));

    const grid = UI.el("div", { class: "grid-2" });

    const left = UI.el("div");
    left.appendChild(UI.el("div", { class: "panel" }, [
      withHeader("行政树", [
        actionBtn("新增根级部门", async () => {
          const name = prompt("部门名称:"); if (!name) return;
          await API.post("/api/org/dept", { name }); await load(); paint();
        }),
      ]),
      UI.el("ul", { class: "tree" }),
    ]));
    left.appendChild(UI.el("div", { class: "panel" }, [
      withHeader("项目组", [
        actionBtn("新增项目组", async () => {
          const name = prompt("项目组名称:"); if (!name) return;
          await API.post("/api/org/project-groups", { name, members: [] }); await load(); paint();
        }),
      ]),
      UI.el("ul", { class: "tree pg-list" }),
    ]));
    left.appendChild(UI.el("div", { class: "panel" }, [
      withHeader("员工列表", [
        actionBtn("新增员工", async () => {
          const name = prompt("姓名:"); if (!name) return;
          const dept = prompt("默认部门 id:"); if (!dept) return;
          await API.post("/api/org/employees", { name, departments: [dept] });
          await load(); paint();
        }),
      ]),
      UI.el("ul", { class: "tree emp-list" }),
    ]));

    const right = UI.el("div", { class: "panel", id: "org-editor" });

    grid.appendChild(left);
    grid.appendChild(right);
    wrap.appendChild(grid);
    main.appendChild(wrap);

    await load(); paint();
  }

  function withHeader(title, actions) {
    return UI.el("div", { class: "page-header" }, [
      UI.el("h3", { class: "page-title" }, title),
      UI.el("div", {}, actions),
    ]);
  }
  function actionBtn(text, fn) {
    const b = UI.el("button", { class: "btn" }, text);
    b.onclick = fn;
    return b;
  }

  return { render };
})();
