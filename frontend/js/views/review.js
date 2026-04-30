/* 任务回顾评价（需求 6）。 */
window.Views = window.Views || {};
window.Views.review = (function () {
  async function render(main, taskId) {
    const t = (await API.get(`/api/tasks/${encodeURIComponent(taskId)}`)).data;
    main.innerHTML = "";
    const wrap = UI.el("div");
    wrap.appendChild(UI.el("div", { class: "page-header" }, [
      UI.el("h2", { class: "page-title" }, `回顾评价 · ${t.title}`),
      UI.el("div", {}, [
        UI.el("a", { class: "btn", href: `#/tasks/${encodeURIComponent(taskId)}` }, "返回任务"),
        UI.el("a", { class: "btn", href: `#/tasks/${encodeURIComponent(taskId)}/proposals` }, "查看方案"),
        UI.el("a", { class: "btn", href: "#/ability-updates" }, "能力值待审"),
      ]),
    ]));

    const panel = UI.el("div", { class: "panel" });
    const ta = UI.el("textarea", { class: "json-input", style: "min-height:120px;", placeholder: "回顾内容：进展、亮点、问题、人员表现等" });
    const moodSel = UI.el("select");
    ["positive", "neutral", "negative"].forEach((v) => {
      const o = UI.el("option", { value: v }, v);
      moodSel.appendChild(o);
    });
    moodSel.value = "neutral";
    const author = UI.el("input", { placeholder: "作者 emp_id（可选）" });
    const submit = UI.el("button", { class: "btn btn-primary" }, "提交回顾");
    submit.onclick = async () => {
      const content = ta.value.trim();
      if (!content) return UI.showToast("回顾内容不能为空", "error");
      try {
        const res = await API.post(`/api/tasks/${encodeURIComponent(taskId)}/review`, {
          content,
          mood: moodSel.value,
          author: author.value || null,
        });
        UI.showToast("已记录回顾", "success");
        if ((res.data.ability_proposals || []).length) {
          UI.showToast(`生成 ${res.data.ability_proposals.length} 条能力值变更建议`, "info");
        }
        await render(main, taskId);
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    panel.appendChild(UI.el("h3", {}, "新增回顾"));
    panel.appendChild(formRow("内容", ta));
    panel.appendChild(formRow("情绪", moodSel));
    panel.appendChild(formRow("作者", author));
    panel.appendChild(UI.el("div", { class: "actions-row" }, [submit]));
    wrap.appendChild(panel);

    const list = UI.el("div", { class: "panel" });
    list.appendChild(UI.el("h3", {}, `历史回顾（${(t.review || []).length}）`));
    if (!(t.review || []).length) list.appendChild(UI.el("div", { class: "muted" }, "暂无"));
    else {
      const ul = UI.el("ul");
      t.review.slice().reverse().forEach((r) => {
        const li = UI.el("li");
        li.innerHTML = `<b>${UI.escape(r.date)}</b> · ${UI.escape(r.author || "")} · ${UI.escape(r.mood || "")}<br>${UI.escape(r.content)}`;
        ul.appendChild(li);
      });
      list.appendChild(ul);
    }
    wrap.appendChild(list);

    main.appendChild(wrap);
  }

  function formRow(label, ctrl) {
    const wrap = UI.el("div", { class: "form-row" });
    wrap.appendChild(UI.el("label", {}, label));
    wrap.appendChild(ctrl);
    return wrap;
  }

  return { render };
})();
