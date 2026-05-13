/* 技能列表编辑器：[+ 添加技能] → 下拉选技能 + Slider 选 1-5 等级 → badge 显示。
 *
 *   Components.skillEditor.mount(container, {
 *     value: [{tag:"产品设计", level:4}],
 *     onChange: (arr) => {},
 *   });
 */
window.Components = window.Components || {};
window.Components.skillEditor = (function () {
  function libOptions() {
    const libs = (window.Meta && window.Meta.libraries) || {};
    return (libs.skill_library || []).map((s) => ({
      value: s.tag,
      label: s.tag,
      sub: s.count != null ? `已被 ${s.count} 处使用` : "",
    }));
  }

  function mount(container, props = {}) {
    const state = {
      items: Array.isArray(props.value)
        ? props.value.map((s) => ({
            tag: s.tag,
            level: s.level == null ? 3 : Number(s.level),
          }))
        : [],
      onChange: props.onChange || (() => {}),
    };

    const root = UI.el("div", { class: "cmp-skill-editor" });
    const list = UI.el("div", { class: "cmp-skill-list" });
    root.appendChild(list);
    const addBtn = UI.el(
      "button",
      { class: "btn", type: "button" },
      "+ 添加技能"
    );
    root.appendChild(addBtn);
    container.appendChild(root);

    function fire() {
      state.onChange(state.items.map((i) => ({ tag: i.tag, level: i.level })));
    }

    function paint() {
      list.innerHTML = "";
      state.items.forEach((item, idx) => {
        const row = UI.el("div", { class: "cmp-skill-row" });

        const selWrap = UI.el("div", { class: "cmp-skill-tag" });
        const taken = new Set(
          state.items.filter((_, i) => i !== idx).map((s) => s.tag)
        );
        const opts = libOptions().filter((o) => !taken.has(o.value));
        if (item.tag && !opts.find((o) => o.value === item.tag)) {
          opts.unshift({ value: item.tag, label: item.tag });
        }
        const tagSel = Components.multiSelect; // not used; we want single + create
        const single = Components.select.mount(selWrap, {
          options: opts,
          value: item.tag || null,
          allowEmpty: false,
          searchable: true,
          placeholder: "选择技能",
          onChange: (v) => {
            if (!v) return;
            item.tag = v;
            fire();
          },
        });
        // 允许新建技能：补一个输入框
        const customRow = UI.el("div", { class: "cmp-skill-custom" });
        const customInp = UI.el("input", {
          placeholder: "或输入新技能名后回车",
        });
        customInp.onkeydown = (e) => {
          if (e.key === "Enter" && customInp.value.trim()) {
            e.preventDefault();
            const v = customInp.value.trim();
            item.tag = v;
            customInp.value = "";
            single.setOptions(
              [{ value: v, label: v }, ...libOptions()].filter(
                (o, i, arr) =>
                  arr.findIndex((x) => x.value === o.value) === i
              )
            );
            single.setValue(v);
            fire();
          }
        };
        customRow.appendChild(customInp);

        const sliderWrap = UI.el("div", { class: "cmp-skill-slider" });
        Components.slider.mount(sliderWrap, {
          value: item.level,
          min: 1,
          max: 5,
          step: 0.01,
          labels: ["入门", "了解", "熟练", "精通", "专家"],
          allowEmpty: false,
          onChange: (v) => {
            item.level = v;
            fire();
          },
        });

        const rm = UI.el(
          "button",
          { class: "btn btn-danger", type: "button", title: "删除" },
          "×"
        );
        rm.onclick = () => {
          state.items.splice(idx, 1);
          paint();
          fire();
        };

        row.appendChild(selWrap);
        row.appendChild(customRow);
        row.appendChild(sliderWrap);
        row.appendChild(rm);
        list.appendChild(row);
      });
      if (!state.items.length) {
        list.appendChild(
          UI.el("div", { class: "muted" }, "暂无技能，点击下方按钮添加")
        );
      }
    }

    addBtn.onclick = () => {
      state.items.push({ tag: "", level: 3 });
      paint();
    };

    paint();

    return {
      root,
      getValue: () =>
        state.items
          .filter((s) => s.tag && s.tag.trim())
          .map((s) => ({ tag: s.tag.trim(), level: Number(s.level) || 0 })),
      setValue: (arr) => {
        state.items = Array.isArray(arr)
          ? arr.map((s) => ({
              tag: s.tag,
              level: s.level == null ? 3 : Number(s.level),
            }))
          : [];
        paint();
      },
      destroy: () => root.remove(),
    };
  }

  return { mount };
})();
