/* 任务回顾评价（需求 6，UX §5.5 改写）。 */
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
    panel.appendChild(UI.el("h3", {}, "新增回顾"));

    const contentField = Components.field.create("内容", {
      required: true,
      help: Help.get("review.content"),
    });
    const ta = UI.el("textarea", {
      rows: "5",
      placeholder: "回顾内容：进展、亮点、问题、人员表现等",
    });
    contentField.body.appendChild(ta);
    panel.appendChild(contentField.root);

    const moodField = Components.field.create("情绪", {
      help: Help.get("review.mood"),
    });
    const moodWrap = UI.el("div");
    const moodCtrl = Components.enumSelect.mount(moodWrap, {
      enumName: "mood",
      value: "neutral",
      allowEmpty: false,
    });
    moodField.body.appendChild(moodWrap);
    panel.appendChild(moodField.root);

    const authorField = Components.field.create("作者", {
      help: Help.get("review.author"),
    });
    const authorWrap = UI.el("div");
    const authorCtrl = Components.employeePicker.mount(authorWrap, {
      value: null,
      placeholder: "选择作者（可选）",
    });
    authorField.body.appendChild(authorWrap);
    panel.appendChild(authorField.root);

    const submit = UI.el("button", { class: "btn btn-primary", "data-form-save": "1" }, "提交回顾");
    submit.onclick = async () => {
      const content = ta.value.trim();
      if (!content) {
        contentField.setError("回顾内容不能为空");
        return;
      }
      contentField.clearError();
      try {
        const res = await API.post(
          `/api/tasks/${encodeURIComponent(taskId)}/review`,
          {
            content,
            mood: moodCtrl.getValue() || "neutral",
            author: authorCtrl.getValue() || null,
          }
        );
        UI.showToast("已记录回顾", "success", {
          detail: Meta.enumLabel("mood", moodCtrl.getValue() || "neutral"),
        });
        if ((res.data.ability_proposals || []).length) {
          UI.showToast(
            `生成 ${res.data.ability_proposals.length} 条能力值变更建议`,
            "info"
          );
        }
        await render(main, taskId);
      } catch (e) { UI.showToast(e.message, "error"); }
    };
    panel.appendChild(UI.el("div", { class: "actions-row" }, [submit]));
    wrap.appendChild(panel);

    const list = UI.el("div", { class: "panel" });
    list.appendChild(UI.el("h3", {}, `历史回顾（${(t.review || []).length}）`));
    if (!(t.review || []).length) {
      list.appendChild(UI.el("div", { class: "muted" }, "暂无"));
    } else {
      const ul = UI.el("ul", { class: "review-timeline" });
      t.review.slice().reverse().forEach((r) => {
        const li = UI.el("li", { class: `review-item mood-${UI.escape(r.mood || "neutral")}` });
        const moodLabel = Meta.enumLabel
          ? Meta.enumLabel("mood", r.mood)
          : r.mood;
        const authorName = r.author
          ? Components.employeePicker.nameOf(r.author)
          : "";
        li.innerHTML = `<div class="review-head"><b>${UI.escape(
          r.date || ""
        )}</b> · ${UI.escape(authorName)} · <span class="badge">${UI.escape(
          moodLabel || ""
        )}</span></div><div class="review-body">${UI.escape(r.content)}</div>`;
        ul.appendChild(li);
      });
      list.appendChild(ul);
    }
    wrap.appendChild(list);

    main.appendChild(wrap);
  }

  return { render };
})();
