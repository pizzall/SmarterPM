/* 多选标签组件
 *
 * 显示已选 badge + 下方下拉添加 + 可选自定义新增。
 * 用法：
 *   Components.multiSelect.mount(container, {
 *     options: [{value:"产品设计", label:"产品设计", sub:"5次"}],
 *     value: ["产品设计"],
 *     placeholder: "选择或输入技能",
 *     allowCreate: true,
 *     onChange: (arr) => {},
 *   });
 */
window.Components = window.Components || {};
window.Components.multiSelect = (function () {
  function mount(container, props = {}) {
    const state = {
      options: props.options || [],
      value: Array.isArray(props.value) ? [...props.value] : [],
      placeholder: props.placeholder || "选择…",
      allowCreate: !!props.allowCreate,
      onChange: props.onChange || (() => {}),
      open: false,
      filter: "",
    };

    const root = UI.el("div", { class: "cmp-multi" });
    const tagsWrap = UI.el("div", { class: "cmp-multi-tags" });
    root.appendChild(tagsWrap);

    const input = UI.el("input", {
      class: "cmp-multi-input",
      placeholder: state.placeholder,
    });
    tagsWrap.appendChild(input);

    const panel = UI.el("div", { class: "cmp-multi-panel hidden" });
    root.appendChild(panel);
    container.appendChild(root);

    function paintTags() {
      tagsWrap
        .querySelectorAll(".cmp-tag")
        .forEach((el) => el.remove());
      state.value.forEach((v) => {
        const opt = state.options.find((o) => o.value === v);
        const tag = UI.el("span", { class: "cmp-tag" });
        tag.innerHTML = `${UI.escape(opt ? opt.label || v : v)}<span class="cmp-tag-x">×</span>`;
        tag.querySelector(".cmp-tag-x").onclick = (e) => {
          e.stopPropagation();
          state.value = state.value.filter((x) => x !== v);
          paintTags();
          state.onChange([...state.value]);
        };
        tagsWrap.insertBefore(tag, input);
      });
    }

    function paintPanel() {
      panel.innerHTML = "";
      const q = state.filter.trim().toLowerCase();
      const taken = new Set(state.value);
      let shown = 0;
      for (const opt of state.options) {
        if (taken.has(opt.value)) continue;
        if (q) {
          const hay = `${opt.label || ""} ${opt.sub || ""} ${opt.value || ""}`
            .toLowerCase();
          if (!hay.includes(q)) continue;
        }
        const li = UI.el("div", { class: "cmp-multi-item" });
        li.innerHTML = `<span class="cmp-multi-main">${UI.escape(
          opt.label || opt.value
        )}</span>${
          opt.sub
            ? `<span class="cmp-multi-sub">${UI.escape(opt.sub)}</span>`
            : ""
        }`;
        li.onclick = (e) => {
          e.stopPropagation();
          add(opt.value);
        };
        panel.appendChild(li);
        shown++;
      }
      if (state.allowCreate && q) {
        const exists =
          state.options.some(
            (o) => (o.label || o.value).toLowerCase() === q
          ) || state.value.includes(state.filter.trim());
        if (!exists) {
          const li = UI.el(
            "div",
            { class: "cmp-multi-item cmp-multi-create" },
            `+ 新增 “${state.filter.trim()}”`
          );
          li.onclick = (e) => {
            e.stopPropagation();
            const raw = state.filter.trim();
            if (!raw) return;
            if (!state.options.some((o) => o.value === raw)) {
              state.options.push({ value: raw, label: raw });
            }
            add(raw);
          };
          panel.appendChild(li);
          shown++;
        }
      }
      if (!shown) {
        panel.appendChild(
          UI.el("div", { class: "cmp-multi-empty" }, "无匹配项")
        );
      }
    }

    function add(v) {
      if (!state.value.includes(v)) {
        state.value.push(v);
        paintTags();
        state.onChange([...state.value]);
      }
      input.value = "";
      state.filter = "";
      paintPanel();
      input.focus();
    }

    function openPanel() {
      state.open = true;
      panel.classList.remove("hidden");
      paintPanel();
    }
    function closePanel() {
      state.open = false;
      panel.classList.add("hidden");
    }

    input.onfocus = openPanel;
    input.onclick = (e) => {
      e.stopPropagation();
      openPanel();
    };
    input.oninput = () => {
      state.filter = input.value;
      if (!state.open) openPanel();
      else paintPanel();
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const raw = state.filter.trim();
        if (!raw) return;
        const hit = state.options.find(
          (o) =>
            (o.label || o.value).toLowerCase() === raw.toLowerCase() ||
            o.value === raw
        );
        if (hit) add(hit.value);
        else if (state.allowCreate) {
          state.options.push({ value: raw, label: raw });
          add(raw);
        }
      } else if (e.key === "Backspace" && !input.value && state.value.length) {
        state.value.pop();
        paintTags();
        state.onChange([...state.value]);
      } else if (e.key === "Escape" && state.open) {
        closePanel();
      }
    };

    document.addEventListener("click", (e) => {
      if (!root.contains(e.target)) closePanel();
    });

    paintTags();

    return {
      root,
      getValue: () => [...state.value],
      setValue: (v) => {
        state.value = Array.isArray(v) ? [...v] : [];
        paintTags();
        if (state.open) paintPanel();
      },
      setOptions: (opts) => {
        state.options = opts || [];
        if (state.open) paintPanel();
      },
      destroy: () => root.remove(),
    };
  }

  return { mount };
})();
