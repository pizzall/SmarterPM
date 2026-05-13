/* 员工元数据查看（需求 2）。 */
window.Views = window.Views || {};
window.Views.employees = (function () {
  async function batchUpdate(data, selected, patch, main) {
    if (!selected.size) {
      UI.showToast("请先勾选员工", "info");
      return;
    }
    const ids = Array.from(selected);
    if (!confirm(`将更新 ${ids.length} 个员工的字段，确定？`)) return;
    let ok = 0;
    for (const id of ids) {
      const emp = data.find((e) => e.id === id);
      if (!emp) continue;
      const payload = {
        name: emp.name,
        departments: emp.departments || [],
        role_tendency: emp.role_tendency || null,
        mbti: emp.mbti || null,
        work_scope: emp.work_scope || [],
        communication: emp.communication ?? null,
        responsibility: emp.responsibility ?? null,
        growth_rate: emp.growth_rate ?? null,
        performance_trend: emp.performance_trend || null,
        skills: emp.skills || [],
        cost_rate: emp.cost_rate ?? null,
        special_notes: emp.special_notes || null,
        ...patch,
      };
      try {
        await API.put(`/api/org/employees/${encodeURIComponent(id)}`, payload);
        ok++;
      } catch (e) {
        console.error(e);
      }
    }
    UI.showToast(`已更新 ${ok} 个员工`, "success");
    await Meta.refresh().catch(() => null);
    await render(main);
  }

  function inferTag(obj) {
    if (!obj) return "";
    const src = obj.source || "";
    if (src.includes("档案直接录入")) return '<span class="badge badge-success">直接录入</span>';
    if (src.includes("均值")) return '<span class="badge badge-warn">部门均值估算</span>';
    if (src.includes("推断") || src.includes("估算")) return '<span class="badge badge-info">推断</span>';
    if (src.includes("缺失")) return '<span class="badge badge-soft">缺失</span>';
    return "";
  }

  function formatSkills(value) {
    if (!Array.isArray(value)) return "—";
    if (!value.length) return "—";
    return value.map((s) => `${UI.escape(s.tag)} Lv${s.level}`).join("、");
  }

  async function render(main, opts = {}) {
    const data = (await API.get("/api/employees")).data || [];

    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, "人员档案"),
      UI.el("span", { class: "page-subtitle" }, "需求 2：含字段缺失推断来源标注"),
    ]));

    const selected = new Set();
    const panel = UI.el("div", { class: "panel" });
    const toolbar = UI.el("div", { class: "page-header" });
    toolbar.appendChild(
      UI.el("span", { id: "emp-batch-info", class: "muted" }, "已选 0")
    );
    const batchActions = UI.el("div");
    const setActive = UI.el("button", { class: "btn" }, "标记绩效=上升");
    setActive.onclick = () => batchUpdate(data, selected, { performance_trend: "rising" }, main);
    const setStable = UI.el("button", { class: "btn" }, "标记=稳定");
    setStable.onclick = () => batchUpdate(data, selected, { performance_trend: "stable" }, main);
    batchActions.appendChild(setActive);
    batchActions.appendChild(setStable);
    toolbar.appendChild(batchActions);
    panel.appendChild(toolbar);

    const table = UI.el("table", { class: "table" });
    table.innerHTML = `
      <thead>
        <tr>
          <th><input type="checkbox" id="emp-check-all"></th>
          <th>ID</th><th>姓名</th><th>部门</th><th>角色倾向</th>
          <th>MBTI</th><th>沟通</th><th>责任</th><th>技能</th><th>趋势</th><th></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");
    data.forEach((emp) => {
      const inf = emp._inferred || {};
      const tr = UI.el("tr");
      tr.innerHTML = `
        <td><input type="checkbox" data-id="${UI.escape(emp.id)}"></td>
        <td>${UI.escape(emp.id)}</td>
        <td>${UI.escape(emp.name || "")}</td>
        <td>${(emp.departments || []).map(Components.deptPicker.nameOf).join("、")}</td>
        <td>${UI.escape(emp.role_tendency || "—")}</td>
        <td>${UI.escape(inf.mbti?.value || emp.mbti || "—")} ${inferTag(inf.mbti)}</td>
        <td>${inf.communication?.value ?? "—"} ${inferTag(inf.communication)}</td>
        <td>${inf.responsibility?.value ?? "—"} ${inferTag(inf.responsibility)}</td>
        <td>${formatSkills(inf.skills?.value || emp.skills)} ${inferTag(inf.skills)}</td>
        <td>${UI.escape(emp.performance_trend || "—")}</td>
        <td><button class="btn">详情</button></td>
      `;
      tr.querySelector("button").onclick = () => showDetail(emp);
      const cb = tr.querySelector('input[type="checkbox"]');
      cb.onchange = () => {
        if (cb.checked) selected.add(emp.id);
        else selected.delete(emp.id);
        const info = document.getElementById("emp-batch-info");
        if (info) info.textContent = `已选 ${selected.size}`;
      };
      tbody.appendChild(tr);
    });
    panel.appendChild(table);
    wrap.appendChild(panel);

    setTimeout(() => {
      const all = document.getElementById("emp-check-all");
      if (all) {
        all.onchange = () => {
          tbody.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.checked = all.checked;
            const eid = cb.dataset.id;
            if (eid) {
              if (all.checked) selected.add(eid);
              else selected.delete(eid);
            }
          });
          const info = document.getElementById("emp-batch-info");
          if (info) info.textContent = `已选 ${selected.size}`;
        };
      }
    }, 0);
    main.appendChild(wrap);

    if (opts.detail) {
      const target = data.find((e) => e.id === opts.detail);
      if (target) showDetail(target);
    }
  }

  async function showDetail(emp) {
    const inf = emp._inferred || {};
    const drawer = UI.el("div", { class: "panel" });
    drawer.innerHTML = `<h3>${UI.escape(emp.name)}（${UI.escape(emp.id)}） 元数据详情</h3>`;
    const lines = [
      ["部门", (emp.departments || []).join("、")],
      ["角色倾向", emp.role_tendency || "—"],
      ["MBTI", `${inf.mbti?.value || emp.mbti || "—"}（来源：${inf.mbti?.source || "—"}）`],
      ["沟通能力", `${inf.communication?.value ?? "—"}（来源：${inf.communication?.source || "—"}）`],
      ["责任度", `${inf.responsibility?.value ?? "—"}（来源：${inf.responsibility?.source || "—"}）`],
      ["成长速度", emp.growth_rate ?? "—"],
      ["绩效趋势", emp.performance_trend || "—"],
      ["工作范围", (emp.work_scope || []).join("、") || "—"],
      ["技能", formatSkills(inf.skills?.value || emp.skills)],
      ["技能来源", inf.skills?.source || "—"],
      ["成本（每周）", emp.cost_rate ?? "—"],
      ["特殊备注", emp.special_notes || "—"],
    ];
    const list = UI.el("div", { class: "kvp" });
    lines.forEach(([k, v]) => {
      list.innerHTML += `<div><span class="k">${UI.escape(k)}</span><span class="v">${typeof v === "string" ? UI.escape(v) : v}</span></div>`;
    });
    drawer.appendChild(list);

    // 任务履历卡片
    const history = UI.el("div");
    history.innerHTML = `<h4>任务履历</h4>`;
    history.appendChild(UI.el("div", { class: "muted" }, "加载中…"));
    drawer.appendChild(history);

    const log = UI.el("div");
    log.innerHTML = `<h4>纠正记录（${(emp.correction_log || []).length}）</h4>`;
    if (!(emp.correction_log || []).length) {
      log.appendChild(UI.el("div", { class: "muted" }, "暂无"));
    } else {
      const ul = UI.el("ul");
      emp.correction_log.slice().reverse().forEach((c) => {
        const li = UI.el("li");
        const friendly = c.field && c.field.startsWith("skill:")
          ? `技能 - ${c.field.slice(6)}`
          : c.field;
        li.innerHTML = `${UI.escape(c.date)} · <b>${UI.escape(friendly || "")}</b>: ${UI.escape(String(c.old_value))} → ${UI.escape(String(c.new_value))}<br><span class="muted">${UI.escape(c.source || "")}</span>`;
        ul.appendChild(li);
      });
      log.appendChild(ul);
    }
    drawer.appendChild(log);

    const main = document.getElementById("app-main");
    main.appendChild(drawer);

    // 异步拉任务历史
    try {
      const all = (await API.get("/api/tasks")).data || [];
      const involved = [];
      all.forEach((t) => {
        const roles = new Set();
        (t.proposals || []).forEach((p) => {
          (p.members || []).forEach((m) => {
            if (m.employee_id === emp.id) roles.add(m.role);
          });
        });
        if (roles.size || t.requester === emp.id) {
          involved.push({
            id: t.id,
            title: t.title,
            status: t.status,
            roles: Array.from(roles),
            asRequester: t.requester === emp.id,
            updated_at: t.updated_at,
            mood: (t.review || []).slice(-1)[0]?.mood || null,
          });
        }
      });
      involved.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
      history.innerHTML = `<h4>任务履历（${involved.length}）</h4>`;
      if (!involved.length) {
        history.appendChild(UI.el("div", { class: "muted" }, "暂无参与记录"));
        return;
      }
      const ul = UI.el("ul", { class: "history-list" });
      involved.forEach((it) => {
        const li = UI.el("li", { class: "history-item" });
        const stLabel = Meta.enumLabel
          ? Meta.enumLabel("task_status", it.status)
          : it.status;
        const moodTag = it.mood
          ? `<span class="badge mood-${UI.escape(it.mood)}">${UI.escape(
              Meta.enumLabel ? Meta.enumLabel("mood", it.mood) : it.mood
            )}</span>`
          : "";
        const roleTags = it.roles
          .map(
            (r) =>
              `<span class="role-badge role-${UI.escape(r)}">${UI.escape(
                Meta.enumLabel ? Meta.enumLabel("role_tendency", r) : r
              )}</span>`
          )
          .join("");
        li.innerHTML = `
          <a href="#/tasks/${encodeURIComponent(it.id)}">${UI.escape(it.title)}</a>
          <span class="badge">${UI.escape(stLabel || "")}</span>
          ${roleTags}${moodTag}
          ${it.asRequester ? '<span class="badge">发起人</span>' : ""}
          <span class="muted">${UI.escape(it.updated_at || "")}</span>
        `;
        ul.appendChild(li);
      });
      history.appendChild(ul);
    } catch (e) {
      history.innerHTML = `<h4>任务履历</h4>`;
      history.appendChild(
        UI.el("div", { class: "muted" }, `加载失败：${e.message}`)
      );
    }
  }

  return { render };
})();
