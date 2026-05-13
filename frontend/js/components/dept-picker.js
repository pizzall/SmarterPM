/* dept-picker：部门多选下拉（按层级路径显示）。
 *
 *   Components.deptPicker.mount(container, {
 *     value: ["dept_product"],
 *     multiple: true,
 *     onChange: (arr|val) => {},
 *   });
 */
window.Components = window.Components || {};
window.Components.deptPicker = (function () {
  function buildOptions() {
    const libs = (window.Meta && window.Meta.libraries) || {};
    return (libs.departments || []).map((d) => ({
      value: d.id,
      label: d.name || d.id,
      sub: d.path && d.path !== d.name ? d.path : d.id,
    }));
  }

  function mount(container, props = {}) {
    const opts = buildOptions();
    if (props.multiple === false) {
      return Components.select.mount(container, {
        options: opts,
        value: props.value,
        allowEmpty: props.allowEmpty !== false,
        searchable: opts.length > 6,
        placeholder: props.placeholder || "选择部门",
        onChange: props.onChange,
      });
    }
    return Components.multiSelect.mount(container, {
      options: opts,
      value: props.value || [],
      placeholder: props.placeholder || "选择部门（可多选）",
      allowCreate: false,
      onChange: props.onChange,
    });
  }

  function nameOf(deptId) {
    if (!deptId) return "";
    const libs = (window.Meta && window.Meta.libraries) || {};
    const hit = (libs.departments || []).find((d) => d.id === deptId);
    return hit ? hit.name : deptId;
  }

  return { mount, nameOf };
})();
