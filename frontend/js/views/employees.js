/* 员工元数据查看（需求 2）。 */
window.Views = window.Views || {};
window.Views.employees = (function () {
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

    const panel = UI.el("div", { class: "panel" });
    const table = UI.el("table", { class: "table" });
    table.innerHTML = `
      <thead>
        <tr>
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
        <td>${UI.escape(emp.id)}</td>
        <td>${UI.escape(emp.name || "")}</td>
        <td>${(emp.departments || []).map(UI.escape).join("、")}</td>
        <td>${UI.escape(emp.role_tendency || "—")}</td>
        <td>${UI.escape(inf.mbti?.value || emp.mbti || "—")} ${inferTag(inf.mbti)}</td>
        <td>${inf.communication?.value ?? "—"} ${inferTag(inf.communication)}</td>
        <td>${inf.responsibility?.value ?? "—"} ${inferTag(inf.responsibility)}</td>
        <td>${formatSkills(inf.skills?.value || emp.skills)} ${inferTag(inf.skills)}</td>
        <td>${UI.escape(emp.performance_trend || "—")}</td>
        <td><button class="btn">详情</button></td>
      `;
      tr.querySelector("button").onclick = () => showDetail(emp);
      tbody.appendChild(tr);
    });
    panel.appendChild(table);
    wrap.appendChild(panel);
    main.appendChild(wrap);

    if (opts.detail) {
      const target = data.find((e) => e.id === opts.detail);
      if (target) showDetail(target);
    }
  }

  function showDetail(emp) {
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
      ["特殊备注", emp.special_notes || "—"],
    ];
    const list = UI.el("div", { class: "kvp" });
    lines.forEach(([k, v]) => {
      list.innerHTML += `<div><span class="k">${UI.escape(k)}</span><span class="v">${typeof v === "string" ? UI.escape(v) : v}</span></div>`;
    });
    drawer.appendChild(list);

    const log = UI.el("div");
    log.innerHTML = `<h4>纠正记录（${(emp.correction_log || []).length}）</h4>`;
    if (!(emp.correction_log || []).length) {
      log.appendChild(UI.el("div", { class: "muted" }, "暂无"));
    } else {
      const ul = UI.el("ul");
      emp.correction_log.slice().reverse().forEach((c) => {
        const li = UI.el("li");
        li.innerHTML = `${UI.escape(c.date)} · <b>${UI.escape(c.field)}</b>: ${UI.escape(String(c.old_value))} → ${UI.escape(String(c.new_value))}<br><span class="muted">${UI.escape(c.source || "")}</span>`;
        ul.appendChild(li);
      });
      log.appendChild(ul);
    }
    drawer.appendChild(log);

    const main = document.getElementById("app-main");
    main.appendChild(drawer);
  }

  return { render };
})();
