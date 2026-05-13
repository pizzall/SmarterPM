/* 单选下拉组件
 *
 * 支持：搜索 / 显示名+副标 / 自定义渲染。
 *
 * 用法：
 *   const ctrl = Components.select.mount(container, {
 *     options: [{value:"emp_001", label:"张袁圆", sub:"emp_001 · 产品设计 Lv4"}],
 *     value: "emp_001",
 *     placeholder: "选择员工",
 *     allowEmpty: true,
 *     searchable: true,
 *     onChange: (v) => {},
 *   });
 *   ctrl.getValue(); ctrl.setValue("..."); ctrl.setOptions([...]);
 */
window.Components = window.Components || {};
window.Components.select = (function () {
  function mount(container, props = {}) {
    const state = {
      options: props.options || [],
      value: props.value ?? null,
      placeholder: props.placeholder || "请选择",
      allowEmpty: props.allowEmpty !== false,
      searchable: props.searchable !== false,
      onChange: props.onChange || (() => {}),
      open: false,
      filter: "",
    };

    const root = UI.el("div", { class: "cmp-select", tabindex: "0" });
    const trigger = UI.el("div", { class: "cmp-select-trigger" });
    const text = UI.el("span", { class: "cmp-select-text" });
    const caret = UI.el("span", { class: "cmp-select-caret" }, "▾");
    trigger.appendChild(text);
    trigger.appendChild(caret);
    root.appendChild(trigger);

    const panel = UI.el("div", { class: "cmp-select-panel hidden" });
    const searchBox = UI.el("input", {
      class: "cmp-select-search",
      placeholder: "搜索…",
    });
    panel.appendChild(searchBox);
    const list = UI.el("div", { class: "cmp-select-list" });
    panel.appendChild(list);
    root.appendChild(panel);
    container.appendChild(root);

    function paintTrigger() {
      const opt = state.options.find((o) => o.value === state.value);
      if (opt) {
        text.innerHTML = `<span class="cmp-select-main">${UI.escape(
          opt.label || opt.value
        )}</span>${
          opt.sub
            ? `<span class="cmp-select-sub">${UI.escape(opt.sub)}</span>`
            : ""
        }`;
        text.classList.remove("placeholder");
      } else {
        text.textContent = state.placeholder;
        text.classList.add("placeholder");
      }
    }

    function paintList() {
      list.innerHTML = "";
      const q = state.filter.trim().toLowerCase();
      let shown = 0;
      if (state.allowEmpty) {
        const li = UI.el(
          "div",
          {
            class:
              "cmp-select-item" + (state.value == null ? " active" : ""),
          },
          "（清空）"
        );
        li.onclick = () => choose(null);
        list.appendChild(li);
      }
      for (const opt of state.options) {
        if (q) {
          const hay = `${opt.label || ""} ${opt.sub || ""} ${opt.value || ""}`
            .toLowerCase();
          if (!hay.includes(q)) continue;
        }
        const li = UI.el("div", {
          class:
            "cmp-select-item" + (opt.value === state.value ? " active" : ""),
        });
        li.innerHTML = `<span class="cmp-select-main">${UI.escape(
          opt.label || opt.value
        )}</span>${
          opt.sub
            ? `<span class="cmp-select-sub">${UI.escape(opt.sub)}</span>`
            : ""
        }`;
        li.onclick = () => choose(opt.value);
        list.appendChild(li);
        shown++;
      }
      if (!shown && !state.allowEmpty) {
        list.appendChild(UI.el("div", { class: "cmp-select-empty" }, "无匹配"));
      }
    }

    function openPanel() {
      state.open = true;
      panel.classList.remove("hidden");
      root.classList.add("open");
      if (state.searchable) {
        searchBox.style.display = "";
        searchBox.value = state.filter;
        setTimeout(() => searchBox.focus(), 0);
      } else {
        searchBox.style.display = "none";
      }
      paintList();
    }

    function closePanel() {
      state.open = false;
      panel.classList.add("hidden");
      root.classList.remove("open");
    }

    function choose(v) {
      state.value = v;
      paintTrigger();
      closePanel();
      state.onChange(v);
    }

    trigger.onclick = (e) => {
      e.stopPropagation();
      state.open ? closePanel() : openPanel();
    };
    root.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !state.open) {
        e.preventDefault();
        openPanel();
      } else if (e.key === "ArrowDown" && !state.open) {
        e.preventDefault();
        openPanel();
      }
    });
    searchBox.oninput = () => {
      state.filter = searchBox.value;
      paintList();
    };
    searchBox.onclick = (e) => e.stopPropagation();

    document.addEventListener("click", (e) => {
      if (!root.contains(e.target)) closePanel();
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.open) {
        closePanel();
        e.stopPropagation();
      }
    });

    paintTrigger();
    paintList();

    return {
      root,
      getValue: () => state.value,
      setValue: (v) => {
        state.value = v;
        paintTrigger();
        if (state.open) paintList();
      },
      setOptions: (opts) => {
        state.options = opts || [];
        paintTrigger();
        if (state.open) paintList();
      },
      destroy: () => root.remove(),
    };
  }

  return { mount };
})();
