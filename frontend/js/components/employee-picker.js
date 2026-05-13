/* employee-picker：员工下拉，显示姓名（id · 顶级技能）。
 *
 *   Components.employeePicker.mount(container, {
 *     value: "emp_001",
 *     allowEmpty: true,
 *     onChange: (v) => {},
 *   });
 */
window.Components = window.Components || {};
window.Components.employeePicker = (function () {
  function buildOptions() {
    const libs = (window.Meta && window.Meta.libraries) || {};
    const emps = libs.employees || [];
    return emps.map((e) => ({
      value: e.id,
      label: e.name,
      sub: `${e.id}${e.top_skill ? " · " + e.top_skill : ""}`,
    }));
  }

  function mount(container, props = {}) {
    return Components.select.mount(container, {
      options: buildOptions(),
      value: props.value,
      allowEmpty: props.allowEmpty !== false,
      searchable: true,
      placeholder: props.placeholder || "选择员工",
      onChange: props.onChange,
    });
  }

  function nameOf(empId) {
    if (!empId) return "";
    const libs = (window.Meta && window.Meta.libraries) || {};
    const hit = (libs.employees || []).find((e) => e.id === empId);
    return hit ? hit.name : empId;
  }

  return { mount, nameOf };
})();
