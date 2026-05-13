/* 角色需求配置器：Leader / Executor / Reviewer 各一行（标签 + 数量 + 说明）。
 *
 *   Components.roleConfig.mount(container, {
 *     value: {leader:1, executor:2, reviewer:1},
 *     onChange: (obj) => {},
 *   });
 */
window.Components = window.Components || {};
window.Components.roleConfig = (function () {
  function defs() {
    const libs = (window.Meta && window.Meta.libraries) || {};
    return (
      libs.role_definitions || [
        { value: "leader", label: "Leader（领导者）", desc: "主导任务方向，把控质量" },
        { value: "executor", label: "Executor（执行者）", desc: "完成具体工作" },
        { value: "reviewer", label: "Reviewer（评审者）", desc: "审核输出质量" },
      ]
    );
  }

  function mount(container, props = {}) {
    const state = {
      value: { ...(props.value || {}) },
      onChange: props.onChange || (() => {}),
    };

    const root = UI.el("div", { class: "cmp-role-config" });
    defs().forEach((d) => {
      const row = UI.el("div", { class: "cmp-role-row" });
      row.appendChild(UI.el("label", { class: "cmp-role-label" }, d.label));
      const num = UI.el("input", {
        type: "number",
        min: "0",
        max: "20",
        class: "cmp-role-num",
      });
      num.value = state.value[d.value] != null ? state.value[d.value] : 0;
      num.oninput = () => {
        const n = Math.max(0, parseInt(num.value || "0", 10) || 0);
        state.value[d.value] = n;
        state.onChange({ ...state.value });
      };
      row.appendChild(num);
      row.appendChild(UI.el("span", { class: "cmp-role-desc" }, d.desc));
      root.appendChild(row);
    });
    container.appendChild(root);

    return {
      root,
      getValue: () => {
        const out = {};
        Object.entries(state.value).forEach(([k, v]) => {
          if (v > 0) out[k] = Number(v);
        });
        return out;
      },
      setValue: (v) => {
        state.value = { ...(v || {}) };
        defs().forEach((d, i) => {
          const inp = root.querySelectorAll("input")[i];
          if (inp) inp.value = state.value[d.value] || 0;
        });
      },
      destroy: () => root.remove(),
    };
  }

  return { mount };
})();
