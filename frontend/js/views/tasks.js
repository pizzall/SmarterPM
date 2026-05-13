/* 任务列表 + CRUD（需求 5，UX §5.2 改写）。 */
window.Views = window.Views || {};
window.Views.tasks = (function () {
  function row(t) {
    const tr = UI.el("tr");
    const cxLabel = Meta.enumLabel
      ? Meta.enumLabel("complexity", t.complexity)
      : t.complexity;
    const stLabel = Meta.enumLabel
      ? Meta.enumLabel("task_status", t.status)
      : t.status;
    const prio = t.priority
      ? `<span class="badge priority-${UI.escape(t.priority)}">${UI.escape(
          Meta.enumLabel ? Meta.enumLabel("priority", t.priority) : t.priority
        )}</span>`
      : "";
    tr.innerHTML = `
      <td>${UI.escape(t.id)}</td>
      <td><a href="#/tasks/${encodeURIComponent(t.id)}">${UI.escape(t.title)}</a> ${prio}</td>
      <td><span class="badge badge-info">${UI.escape(cxLabel || "")}</span></td>
      <td>${(t.required_skills || []).map(UI.escape).join("、") || "—"}</td>
      <td><span class="badge">${UI.escape(stLabel || "")}</span></td>
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
      UI.el(
        "button",
        {
          class: "btn btn-primary",
          onClick: () => (location.hash = "#/planning"),
        },
        "+ 通过对话规划新任务"
      ),
    ]));

    const panel = UI.el("div", { class: "panel" });
    if (!tasks.length) {
      const empty = UI.el(
        "div",
        { class: "empty" },
        "暂无任务"
      );
      const btn = UI.el(
        "button",
        {
          class: "btn btn-primary",
          style: "margin-top:12px;",
          onClick: () => (location.hash = "#/planning"),
        },
        "→ 通过对话规划首个任务"
      );
      empty.appendChild(UI.el("div"));
      empty.appendChild(btn);
      panel.appendChild(empty);
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
    const formBtn = UI.el("button", { class: "active" }, "表单");
    formBtn.onclick = () => { mode = "form"; render(); };
    const progressBtn = UI.el("button", {}, "进度");
    progressBtn.onclick = () => { mode = "progress"; render(); };
    const jsonBtn = UI.el("button", {});
    jsonBtn.innerHTML = 'JSON 原文 <span class="badge">高级</span>';
    jsonBtn.onclick = () => { mode = "json"; render(); };
    tabs.appendChild(formBtn);
    tabs.appendChild(progressBtn);
    tabs.appendChild(jsonBtn);
    panel.appendChild(tabs);

    const body = UI.el("div");
    panel.appendChild(body);

    function render() {
      formBtn.classList.toggle("active", mode === "form");
      progressBtn.classList.toggle("active", mode === "progress");
      jsonBtn.classList.toggle("active", mode === "json");
      body.innerHTML = "";
      if (mode === "json") {
        const note = UI.el(
          "div",
          { class: "muted", style: "margin-bottom:6px;" },
          "提示：JSON 模式仅供熟悉数据结构的高级用户使用。"
        );
        body.appendChild(note);
        const ta = UI.el("textarea", { class: "json-input" });
        ta.value = JSON.stringify(t, null, 2);
        body.appendChild(ta);
        const save = UI.el("button", { class: "btn btn-primary" }, "保存 JSON");
        save.onclick = async () => {
          let parsed;
          try { parsed = JSON.parse(ta.value); }
          catch { return UI.showToast("JSON 解析失败", "error"); }
          try {
            await API.put(`/api/tasks/${encodeURIComponent(taskId)}`, parsed);
            UI.showToast("已保存", "success");
            await Meta.refresh().catch(()=>null);
            location.hash = `#/tasks/${encodeURIComponent(taskId)}`;
          } catch (e) { UI.showToast(e.message, "error"); }
        };
        body.appendChild(UI.el("div", { class: "actions-row" }, [save]));
        return;
      }
      if (mode === "progress") {
        renderProgress(body, t, taskId);
        return;
      }
      renderForm(body, t, taskId);
    }

    wrap.appendChild(panel);
    main.appendChild(wrap);
    render();
  }

  function renderForm(body, t, taskId) {
    const f = UI.el("div");

    // 标题
    const titleField = Components.field.create("标题", {
      required: true,
      help: Help.get("task.title"),
    });
    const titleInput = UI.el("input", { name: "title" });
    titleInput.value = t.title || "";
    titleField.body.appendChild(titleInput);
    f.appendChild(titleField.root);

    // 描述
    const descField = Components.field.create("描述", {
      help: Help.get("task.description"),
    });
    const descArea = UI.el("textarea", { rows: "4" });
    descArea.value = t.description || "";
    descField.body.appendChild(descArea);
    f.appendChild(descField.root);

    // 发起人
    const reqField = Components.field.create("发起人", {
      help: Help.get("task.requester"),
    });
    const reqWrap = UI.el("div");
    const reqCtrl = Components.employeePicker.mount(reqWrap, {
      value: t.requester || null,
    });
    reqField.body.appendChild(reqWrap);
    f.appendChild(reqField.root);

    // 复杂度
    const cxField = Components.field.create("复杂度", {
      required: true,
      help: Help.get("task.complexity"),
    });
    const cxWrap = UI.el("div");
    const cxCtrl = Components.enumSelect.mount(cxWrap, {
      enumName: "complexity",
      value: t.complexity || "normal",
      allowEmpty: false,
    });
    cxField.body.appendChild(cxWrap);
    f.appendChild(cxField.root);

    // 优先级
    const prField = Components.field.create("优先级", {
      help: Help.get("task.priority"),
    });
    const prWrap = UI.el("div");
    const prCtrl = Components.enumSelect.mount(prWrap, {
      enumName: "priority",
      value: t.priority || "normal",
      allowEmpty: true,
    });
    prField.body.appendChild(prWrap);
    f.appendChild(prField.root);

    // 需求技能（多选）
    const skField = Components.field.create("需求技能", {
      help: Help.get("task.required_skills"),
    });
    const skWrap = UI.el("div");
    const skOpts = Meta.skills().map((s) => ({
      value: s.tag,
      label: s.tag,
      sub: s.count != null ? `已被 ${s.count} 处使用` : "",
    }));
    const skCtrl = Components.multiSelect.mount(skWrap, {
      options: skOpts,
      value: t.required_skills || [],
      placeholder: "选择或输入技能后回车",
      allowCreate: true,
    });
    skField.body.appendChild(skWrap);
    f.appendChild(skField.root);

    // 角色需求
    const rcField = Components.field.create("角色需求", {
      help: Help.get("task.required_roles"),
    });
    const rcWrap = UI.el("div");
    const rcCtrl = Components.roleConfig.mount(rcWrap, {
      value: t.required_roles || { leader: 0, executor: 1, reviewer: 0 },
    });
    rcField.body.appendChild(rcWrap);
    f.appendChild(rcField.root);

    // 周期
    const durField = Components.field.create("周期（周）", {
      help: Help.get("task.duration_weeks"),
    });
    const durInput = UI.el("input", { type: "number", min: "1", max: "52" });
    durInput.value = String(t.duration_weeks || 1);
    durField.body.appendChild(durInput);
    f.appendChild(durField.root);

    // 依赖任务
    const depField = Components.field.create("前置依赖任务", {
      help: "需要先完成的任务",
    });
    const depWrap = UI.el("div");
    const taskOpts = ((window.__allTaskOptions__ ||= [])).length
      ? window.__allTaskOptions__
      : [];
    const depCtrl = Components.multiSelect.mount(depWrap, {
      options: taskOpts,
      value: t.depends_on || [],
      placeholder: "选择前置任务",
      allowCreate: false,
    });
    depField.body.appendChild(depWrap);
    f.appendChild(depField.root);
    // 异步补全选项
    API.get("/api/tasks")
      .then((res) => {
        const all = (res.data || []).filter((x) => x.id !== t.id);
        const opts = all.map((x) => ({
          value: x.id,
          label: x.title,
          sub: x.id,
        }));
        window.__allTaskOptions__ = opts;
        depCtrl.setOptions(opts);
      })
      .catch(() => null);

    // Sprint
    const spField = Components.field.create("Sprint", {
      help: Help.get("task.sprint_id"),
    });
    const spWrap = UI.el("div");
    const spCtrl = Components.sprintPicker.mount(spWrap, {
      value: t.sprint_id || null,
    });
    spField.body.appendChild(spWrap);
    f.appendChild(spField.root);

    // 状态
    const stField = Components.field.create("状态", {
      help: Help.get("task.status"),
    });
    const stWrap = UI.el("div");
    const stCtrl = Components.enumSelect.mount(stWrap, {
      enumName: "task_status",
      value: t.status || "draft",
      allowEmpty: false,
    });
    stField.body.appendChild(stWrap);
    f.appendChild(stField.root);

    // 预算
    const bgField = Components.field.create("预算上限（可选）", {
      help: "若填写，将作为推荐人选时的成本上限参考",
    });
    const bgInput = UI.el("input", {
      type: "number",
      min: "0",
      placeholder: "例如：10000",
    });
    bgInput.value = t.budget_cap != null ? String(t.budget_cap) : "";
    bgField.body.appendChild(bgInput);
    f.appendChild(bgField.root);

    // 主要任务
    const primField = Components.field.create("主要任务", {
      help: Help.get("task.primary_task"),
    });
    const primArea = UI.el("textarea", { rows: "3" });
    primArea.value = t.primary_task || "";
    primField.body.appendChild(primArea);
    f.appendChild(primField.root);

    // 次要任务
    const subField = Components.field.create("次要任务", {
      help: Help.get("task.sub_tasks"),
    });
    const subOpts = [];
    const subCtrl = Components.multiSelect.mount(subField.body, {
      options: subOpts,
      value: t.sub_tasks || [],
      placeholder: "输入次要任务名后回车",
      allowCreate: true,
    });
    f.appendChild(subField.root);

    const save = UI.el(
      "button",
      { class: "btn btn-primary", "data-form-save": "1" },
      "保存"
    );
    save.onclick = async () => {
      const v = Components.validator.create();
      v.add(titleField, () => titleInput.value, [
        Components.validator.required("标题不能为空"),
      ]);
      v.add(cxField, () => cxCtrl.getValue(), [
        Components.validator.required("请选择复杂度"),
      ]);
      v.add(durField, () => durInput.value, [
        Components.validator.range(1, 52, "1-52 周"),
      ]);
      if (!v.validate()) {
        UI.showToast("请修正高亮字段", "error");
        return;
      }
      const payload = {
        title: titleInput.value.trim(),
        description: descArea.value,
        requester: reqCtrl.getValue() || null,
        complexity: cxCtrl.getValue() || "normal",
        priority: prCtrl.getValue() || null,
        required_skills: skCtrl.getValue(),
        required_roles: rcCtrl.getValue(),
        duration_weeks: Number(durInput.value) || 1,
        depends_on: depCtrl.getValue(),
        sprint_id: spCtrl.getValue() || null,
        status: stCtrl.getValue() || "draft",
        budget_cap: bgInput.value === "" ? null : Number(bgInput.value),
        primary_task: primArea.value || null,
        sub_tasks: subCtrl.getValue(),
      };
      try {
        await API.put(`/api/tasks/${encodeURIComponent(taskId)}`, payload);
        UI.showToast("已保存", "success", { detail: payload.title });
        await Meta.refresh().catch(()=>null);
        location.hash = "#/tasks";
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    const del = UI.el("button", { class: "btn btn-danger" }, "删除任务");
    del.onclick = async () => {
      if (!confirm("删除任务？方案与回顾会一并删除。")) return;
      await API.del(`/api/tasks/${encodeURIComponent(taskId)}`);
      location.hash = "#/tasks";
    };
    f.appendChild(UI.el("div", { class: "actions-row" }, [save, del]));
    body.appendChild(f);
  }

  function renderProgress(body, t, taskId) {
    const wrap = UI.el("div", { class: "task-progress" });

    // 进度条
    const progField = Components.field.create("执行进度", {
      help: Help.get("task.progress"),
    });
    const progWrap = UI.el("div");
    const progCtrl = Components.slider.mount(progWrap, {
      value: t.progress == null ? 0 : Number(t.progress),
      min: 0, max: 100, step: 1,
      labels: ["未开始", "1/4", "1/2", "3/4", "已完成"],
      allowEmpty: false,
    });
    progField.body.appendChild(progWrap);
    wrap.appendChild(progField.root);

    // 阻塞点
    const blockField = Components.field.create("当前阻塞", {
      help: "标记阻塞推进的问题，每行一个",
    });
    const blockOpts = [];
    const blockCtrl = Components.multiSelect.mount(blockField.body, {
      options: blockOpts,
      value: t.blockers || [],
      placeholder: "输入阻塞点后回车",
      allowCreate: true,
    });
    wrap.appendChild(blockField.root);

    // 里程碑
    const msField = Components.field.create("里程碑", {
      help: "勾选已完成的里程碑",
    });
    const msList = UI.el("div", { class: "task-ms-list" });
    let milestones = Array.isArray(t.milestones)
      ? t.milestones.slice()
      : [];

    function paintMs() {
      msList.innerHTML = "";
      milestones.forEach((m, i) => {
        const row = UI.el("div", { class: "task-ms-row" });
        const cb = UI.el("input", { type: "checkbox" });
        if (m.done) cb.checked = true;
        cb.onchange = () => { milestones[i].done = cb.checked; };
        const title = UI.el("input", {
          placeholder: "里程碑标题",
          style: "flex:1;",
        });
        title.value = m.title || "";
        title.oninput = () => { milestones[i].title = title.value; };
        const due = UI.el("input", {
          type: "date",
        });
        due.value = m.due || "";
        due.onchange = () => { milestones[i].due = due.value; };
        const rm = UI.el(
          "button",
          { class: "btn btn-danger", style: "padding:2px 8px;" },
          "×"
        );
        rm.onclick = () => { milestones.splice(i, 1); paintMs(); };
        row.appendChild(cb);
        row.appendChild(title);
        row.appendChild(due);
        row.appendChild(rm);
        msList.appendChild(row);
      });
      const add = UI.el("button", { class: "btn", style: "margin-top:4px;" }, "+ 添加里程碑");
      add.onclick = () => {
        milestones.push({ title: "", due: "", done: false });
        paintMs();
      };
      msList.appendChild(add);
    }
    paintMs();
    msField.body.appendChild(msList);
    wrap.appendChild(msField.root);

    const save = UI.el(
      "button",
      { class: "btn btn-primary", "data-form-save": "1" },
      "保存进度"
    );
    save.onclick = async () => {
      const payload = {
        title: t.title,
        description: t.description || "",
        requester: t.requester || null,
        complexity: t.complexity || "normal",
        priority: t.priority || null,
        required_skills: t.required_skills || [],
        required_roles: t.required_roles || {},
        duration_weeks: t.duration_weeks || 1,
        sprint_id: t.sprint_id || null,
        status: t.status || "draft",
        primary_task: t.primary_task || null,
        sub_tasks: t.sub_tasks || [],
        depends_on: t.depends_on || [],
        budget_cap: t.budget_cap != null ? t.budget_cap : null,
        progress: progCtrl.getValue(),
        blockers: blockCtrl.getValue(),
        milestones: milestones.filter((m) => (m.title || "").trim()),
      };
      try {
        await API.put(`/api/tasks/${encodeURIComponent(taskId)}`, payload);
        UI.showToast("已保存进度", "success", {
          detail: `${payload.progress}%`,
        });
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    wrap.appendChild(UI.el("div", { class: "actions-row" }, [save]));
    body.appendChild(wrap);
  }

  return {
    render(main, opts = {}) {
      if (opts.detail) return renderDetail(main, opts.detail);
      return renderList(main);
    },
  };
})();
