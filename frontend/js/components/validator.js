/* 简单的表单校验器：
 *   const v = Components.validator.create();
 *   v.add(fieldOrCtl, () => value, [Components.validator.required("姓名必填")]);
 *   if (!v.validate()) UI.showToast("请修正错误", "error");
 */
window.Components = window.Components || {};
window.Components.validator = (function () {
  function required(msg) {
    return (val) => {
      if (val == null) return msg || "必填";
      if (typeof val === "string" && !val.trim()) return msg || "必填";
      if (Array.isArray(val) && !val.length) return msg || "必填";
      return null;
    };
  }
  function range(min, max, msg) {
    return (val) => {
      if (val == null || val === "") return null;
      const n = Number(val);
      if (isNaN(n)) return msg || "应为数字";
      if (n < min || n > max) return msg || `范围 ${min} - ${max}`;
      return null;
    };
  }
  function integer(msg) {
    return (val) => {
      if (val == null || val === "") return null;
      if (!Number.isInteger(Number(val))) return msg || "应为整数";
      return null;
    };
  }
  function oneOf(values, msg) {
    return (val) => {
      if (val == null || val === "") return null;
      if (!values.includes(val)) return msg || `必须是 ${values.join("/")} 之一`;
      return null;
    };
  }

  function create() {
    const entries = [];
    return {
      add(field, getter, rules) {
        entries.push({ field, getter, rules });
      },
      validate() {
        let ok = true;
        entries.forEach((e) => {
          const v = e.getter();
          let errMsg = null;
          for (const r of e.rules || []) {
            const err = r(v);
            if (err) {
              errMsg = err;
              break;
            }
          }
          if (e.field && typeof e.field.setError === "function") {
            e.field.setError(errMsg);
          }
          if (errMsg) ok = false;
        });
        return ok;
      },
      clear() {
        entries.forEach((e) => {
          if (e.field && typeof e.field.clearError === "function")
            e.field.clearError();
        });
      },
    };
  }

  /* 把 field 控件绑定到"输入时清错" + "失焦时校验"，提升即时反馈。
   *
   *   Components.validator.attach(field, inputOrCtrl, () => value, rules);
   */
  function attach(field, inputOrCtrl, getter, rules) {
    function runOnce() {
      const v = getter();
      let err = null;
      for (const r of rules || []) {
        const e = r(v);
        if (e) { err = e; break; }
      }
      if (field && typeof field.setError === "function") field.setError(err);
      return !err;
    }
    if (inputOrCtrl && typeof inputOrCtrl.addEventListener === "function") {
      inputOrCtrl.addEventListener("input", () => {
        if (field && typeof field.clearError === "function") field.clearError();
      });
      inputOrCtrl.addEventListener("blur", runOnce);
    }
    return runOnce;
  }

  return { create, required, range, integer, oneOf, attach };
})();
