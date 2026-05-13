/* sprint-picker：Sprint 下拉。 */
window.Components = window.Components || {};
window.Components.sprintPicker = (function () {
  function buildOptions() {
    const libs = (window.Meta && window.Meta.libraries) || {};
    return (libs.sprints || []).map((s) => ({
      value: s.id,
      label: s.id,
      sub: `${s.start_date || ""}${s.duration_weeks ? " · " + s.duration_weeks + " 周" : ""}`,
    }));
  }

  function mount(container, props = {}) {
    return Components.select.mount(container, {
      options: buildOptions(),
      value: props.value,
      allowEmpty: true,
      searchable: false,
      placeholder: props.placeholder || "选择 Sprint（可空）",
      onChange: props.onChange,
    });
  }

  return { mount };
})();
