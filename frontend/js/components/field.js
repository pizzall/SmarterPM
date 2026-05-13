/* 字段包装：统一 label + 控件容器 + tooltip + 错误位。
 *
 *   const f = Components.field.create("姓名", { required:true, help:"显示名" });
 *   f.body.appendChild(...);                      // 把控件放进去
 *   f.setError("不能为空"); f.clearError();
 *   container.appendChild(f.root);
 */
window.Components = window.Components || {};
window.Components.field = (function () {
  function create(labelText, options = {}) {
    const root = UI.el("div", { class: "form-row cmp-field" });
    const labelLine = UI.el("div", { class: "cmp-field-label" });
    const labelEl = UI.el("label", {}, labelText || "");
    if (options.required) {
      labelEl.appendChild(UI.el("span", { class: "cmp-field-required" }, " *"));
    }
    labelLine.appendChild(labelEl);
    if (options.help) {
      const help = UI.el(
        "span",
        { class: "cmp-field-help", tabindex: "0" },
        "?"
      );
      Components.tooltip.attach(help, options.help);
      labelLine.appendChild(help);
    }
    root.appendChild(labelLine);
    const body = UI.el("div", { class: "cmp-field-body" });
    root.appendChild(body);
    const error = UI.el("div", { class: "cmp-field-error hidden" });
    root.appendChild(error);

    return {
      root,
      body,
      label: labelEl,
      setError(msg) {
        if (!msg) {
          error.textContent = "";
          error.classList.add("hidden");
          root.classList.remove("has-error");
        } else {
          error.textContent = msg;
          error.classList.remove("hidden");
          root.classList.add("has-error");
        }
      },
      clearError() {
        error.textContent = "";
        error.classList.add("hidden");
        root.classList.remove("has-error");
      },
    };
  }

  return { create };
})();
