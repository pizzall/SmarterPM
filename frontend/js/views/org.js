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
    const formBtn = UI.el(
      "button",
      { class: state.mode === "form" ? "active" : "" },
      "表单"
    );
    formBtn.onclick = () => { state.mode = "form"; paintEditor(); };
    const jsonBtn = UI.el(
      "button",
      { class: state.mode === "json" ? "active" : "" }
    );
    jsonBtn.innerHTML = 'JSON 原文 <span class="badge">高级</span>';
    jsonBtn.onclick = () => { state.mode = "json"; paintEditor(); };
    tabs.appendChild(formBtn);
    tabs.appendChild(jsonBtn);
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
        await load(); await Meta.refresh().catch(()=>null); paint();
      });
      return;
    }
    const f = UI.el("div");
    const nameField = Components.field.create("部门名称", { required: true });
    const nameInput = UI.el("input", { name: "name" });
    nameInput.value = dept.name || "";
    nameField.body.appendChild(nameInput);
    f.appendChild(nameField.root);

    const headField = Components.field.create("负责人", {
      help: "选择员工作为部门负责人",
    });
    const headPickerWrap = UI.el("div");
    const headCtrl = Components.employeePicker.mount(headPickerWrap, {
      value: dept.head || null,
      allowEmpty: true,
    });
    headField.body.appendChild(headPickerWrap);
    f.appendChild(headField.root);

    const save = UI.el("button", { class: "btn btn-primary" }, "保存");
    save.onclick = async () => {
      const nm = nameInput.value.trim();
      if (!nm) {
        nameField.setError("部门名称不能为空");
        return;
      }
      nameField.clearError();
      const payload = { name: nm, head: headCtrl.getValue() || null };
      try {
        await API.put(`/api/org/dept/${id}`, payload);
        UI.showToast("部门已更新", "success", { detail: `${nm}` });
        await load(); await Meta.refresh().catch(()=>null); paint();
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
        await load(); await Meta.refresh().catch(()=>null); paint();
      });
      return;
    }
    const f = UI.el("div");

    const nameField = Components.field.create("名称", { required: true });
    const nameInput = UI.el("input", { name: "name" });
    nameInput.value = pg.name || "";
    nameField.body.appendChild(nameInput);
    f.appendChild(nameField.root);

    const headField = Components.field.create("负责人", { help: Help.get("pg.head") });
    const headWrap = UI.el("div");
    const headCtrl = Components.employeePicker.mount(headWrap, { value: pg.head || null });
    headField.body.appendChild(headWrap);
    f.appendChild(headField.root);

    const memField = Components.field.create("成员", { help: Help.get("pg.members") });
    const memWrap = UI.el("div");
    const memOpts = Meta.employees().map((e) => ({
      value: e.id,
      label: e.name,
      sub: e.id,
    }));
    const memCtrl = Components.multiSelect.mount(memWrap, {
      options: memOpts,
      value: pg.members || [],
      placeholder: "添加成员…",
      allowCreate: false,
    });
    memField.body.appendChild(memWrap);
    f.appendChild(memField.root);

    const statField = Components.field.create("状态", { help: Help.get("pg.status") });
    const statWrap = UI.el("div");
    const statCtrl = Components.enumSelect.mount(statWrap, {
      enumName: "project_group_status",
      value: pg.status || "active",
      allowEmpty: false,
    });
    statField.body.appendChild(statWrap);
    f.appendChild(statField.root);

    const save = UI.el("button", { class: "btn btn-primary", "data-form-save": "1" }, "保存");
    save.onclick = async () => {
      const nm = nameInput.value.trim();
      if (!nm) { nameField.setError("不能为空"); return; }
      nameField.clearError();
      const payload = {
        name: nm,
        head: headCtrl.getValue() || null,
        members: memCtrl.getValue(),
        status: statCtrl.getValue() || "active",
      };
      try {
        await API.put(`/api/org/project-groups/${id}`, payload);
        UI.showToast("项目组已更新", "success", { detail: nm });
        await load(); await Meta.refresh().catch(()=>null); paint();
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    const del = UI.el("button", { class: "btn btn-danger" }, "删除");
    del.onclick = async () => {
      if (!confirm("删除此项目组？")) return;
      await API.del(`/api/org/project-groups/${id}`);
      state.selected = null; await load(); await Meta.refresh().catch(()=>null); paint();
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
        await load(); await Meta.refresh().catch(()=>null); paint();
      });
      return;
    }
    const f = UI.el("div", { class: "emp-edit-form" });

    // 姓名
    const nameField = Components.field.create("姓名", {
      required: true,
      help: Help.get("emp.name"),
    });
    const nameInput = UI.el("input", { name: "name" });
    nameInput.value = emp.name || "";
    nameField.body.appendChild(nameInput);
    f.appendChild(nameField.root);

    // 部门（多选）
    const deptField = Components.field.create("部门", {
      required: true,
      help: Help.get("emp.departments"),
    });
    const deptWrap = UI.el("div");
    const deptCtrl = Components.deptPicker.mount(deptWrap, {
      value: emp.departments || [],
      multiple: true,
    });
    deptField.body.appendChild(deptWrap);
    f.appendChild(deptField.root);

    // 角色倾向（enum）
    const roleField = Components.field.create("角色倾向", {
      help: Help.get("emp.role_tendency"),
    });
    const roleWrap = UI.el("div");
    const roleCtrl = Components.enumSelect.mount(roleWrap, {
      enumName: "role_tendency",
      value: emp.role_tendency || null,
      allowEmpty: true,
    });
    roleField.body.appendChild(roleWrap);
    f.appendChild(roleField.root);

    // MBTI（enum）
    const mbtiField = Components.field.create("MBTI", {
      help: Help.get("emp.mbti"),
    });
    const mbtiWrap = UI.el("div");
    const mbtiCtrl = Components.enumSelect.mount(mbtiWrap, {
      enumName: "mbti",
      value: emp.mbti || null,
      allowEmpty: true,
    });
    mbtiField.body.appendChild(mbtiWrap);
    f.appendChild(mbtiField.root);

    // 工作范围（多选 + 可新建）
    const scopeField = Components.field.create("工作范围", {
      help: Help.get("emp.work_scope"),
    });
    const scopeWrap = UI.el("div");
    const scopeOpts = Meta.scopes().map((s) => ({ value: s, label: s }));
    const scopeCtrl = Components.multiSelect.mount(scopeWrap, {
      options: scopeOpts,
      value: emp.work_scope || [],
      placeholder: "选择或输入工作范围",
      allowCreate: true,
    });
    scopeField.body.appendChild(scopeWrap);
    f.appendChild(scopeField.root);

    // 沟通 / 责任 / 成长（slider）
    const labels15 = (Meta.enums && Meta.enums.ability_level_labels) || [
      "很差", "较差", "一般", "不错", "很好",
    ];
    const commField = Components.field.create("沟通能力 (1-5)", {
      help: Help.get("emp.communication"),
    });
    const commWrap = UI.el("div");
    const commCtrl = Components.slider.mount(commWrap, {
      value: emp.communication,
      min: 1, max: 5, step: 0.01,
      labels: labels15,
    });
    commField.body.appendChild(commWrap);
    f.appendChild(commField.root);

    const respField = Components.field.create("责任度 (1-5)", {
      help: Help.get("emp.responsibility"),
    });
    const respWrap = UI.el("div");
    const respCtrl = Components.slider.mount(respWrap, {
      value: emp.responsibility,
      min: 1, max: 5, step: 0.01,
      labels: labels15,
    });
    respField.body.appendChild(respWrap);
    f.appendChild(respField.root);

    const growField = Components.field.create("成长速度 (1-5)", {
      help: Help.get("emp.growth_rate"),
    });
    const growWrap = UI.el("div");
    const growCtrl = Components.slider.mount(growWrap, {
      value: emp.growth_rate,
      min: 1, max: 5, step: 0.01,
      labels: labels15,
    });
    growField.body.appendChild(growWrap);
    f.appendChild(growField.root);

    // 绩效趋势
    const trendField = Components.field.create("绩效趋势", {
      help: Help.get("emp.performance_trend"),
    });
    const trendWrap = UI.el("div");
    const trendCtrl = Components.enumSelect.mount(trendWrap, {
      enumName: "performance_trend",
      value: emp.performance_trend || null,
      allowEmpty: true,
    });
    trendField.body.appendChild(trendWrap);
    f.appendChild(trendField.root);

    // 技能编辑器
    const skillField = Components.field.create("技能", {
      help: Help.get("emp.skills"),
    });
    const skillWrap = UI.el("div");
    const skillCtrl = Components.skillEditor.mount(skillWrap, {
      value: emp.skills || [],
    });
    skillField.body.appendChild(skillWrap);
    f.appendChild(skillField.root);

    // 成本（用于推荐时的预算软约束）
    const costField = Components.field.create("成本（每周，可选）", {
      help: "用于任务预算上限校验；为空表示不参与成本判断",
    });
    const costInput = UI.el("input", {
      type: "number",
      min: "0",
      placeholder: "例如：5000",
    });
    costInput.value = emp.cost_rate != null ? String(emp.cost_rate) : "";
    costField.body.appendChild(costInput);
    f.appendChild(costField.root);

    // 特殊备注
    const noteField = Components.field.create("特殊备注", {
      help: Help.get("emp.special_notes"),
    });
    const noteArea = UI.el("textarea", { rows: "3" });
    noteArea.value = emp.special_notes || "";
    noteField.body.appendChild(noteArea);
    f.appendChild(noteField.root);

    const save = UI.el(
      "button",
      { class: "btn btn-primary", "data-form-save": "1" },
      "保存"
    );
    save.onclick = async () => {
      const v = Components.validator.create();
      v.add(nameField, () => nameInput.value, [
        Components.validator.required("姓名不能为空"),
      ]);
      v.add(deptField, () => deptCtrl.getValue(), [
        Components.validator.required("至少选择 1 个部门"),
      ]);
      v.add(commField, () => commCtrl.getValue(), [
        Components.validator.range(1, 5),
      ]);
      v.add(respField, () => respCtrl.getValue(), [
        Components.validator.range(1, 5),
      ]);
      v.add(growField, () => growCtrl.getValue(), [
        Components.validator.range(1, 5),
      ]);
      if (!v.validate()) {
        UI.showToast("请修正高亮字段", "error");
        return;
      }
      const payload = {
        name: nameInput.value.trim(),
        departments: deptCtrl.getValue(),
        role_tendency: roleCtrl.getValue() || null,
        mbti: mbtiCtrl.getValue() || null,
        work_scope: scopeCtrl.getValue(),
        communication: commCtrl.getValue(),
        responsibility: respCtrl.getValue(),
        growth_rate: growCtrl.getValue(),
        performance_trend: trendCtrl.getValue() || null,
        skills: skillCtrl.getValue(),
        cost_rate: costInput.value === "" ? null : Number(costInput.value),
        special_notes: noteArea.value.trim() || null,
      };
      try {
        await API.put(`/api/org/employees/${id}`, payload);
        UI.showToast("员工已更新", "success", {
          detail: `${payload.name} · ${payload.skills.length} 项技能`,
        });
        await load(); await Meta.refresh().catch(()=>null); paint();
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    const del = UI.el("button", { class: "btn btn-danger" }, "删除");
    del.onclick = async () => {
      if (!confirm(`删除员工 ${emp.name}（${id}）？`)) return;
      await API.del(`/api/org/employees/${id}`);
      state.selected = null;
      await load();
      await Meta.refresh().catch(()=>null);
      paint();
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
