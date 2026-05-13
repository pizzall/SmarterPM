/* enum-select：封装 Components.select，自动按 enum 名读取 Meta 中的可选值。
 *
 *   Components.enumSelect.mount(container, {
 *     enumName: "complexity",
 *     value: "normal",
 *     allowEmpty: false,
 *     onChange: (v) => {},
 *   });
 */
window.Components = window.Components || {};
window.Components.enumSelect = (function () {
  function mount(container, props = {}) {
    const { enumName, value, allowEmpty, onChange, placeholder } = props;
    const meta = (window.Meta && window.Meta.enums) || {};
    const items = meta[enumName] || [];
    const options = items.map((it) => ({
      value: it.value,
      label: it.label || it.value,
      sub: it.desc || "",
    }));
    return Components.select.mount(container, {
      options,
      value,
      allowEmpty: allowEmpty !== false,
      searchable: items.length > 6,
      placeholder: placeholder || "请选择",
      onChange,
    });
  }

  return { mount };
})();
