/* 平滑 Slider 组件，默认 0.01 步进 + 自动按 step 截断小数位。
 *
 * 用法：
 *   Components.slider.mount(container, {
 *     value: 4.25, min:1, max:5, step:0.01,
 *     labels: ["很差","较差","一般","不错","很好"],
 *     allowEmpty: true,
 *     onChange: (v) => {},
 *   });
 *
 * 说明：
 * - 内部根据 step 推断小数位数（如 step=0.01 → 2 位，step=0.5 → 1 位，step=1 → 0 位）。
 *   也可以通过 props.precision 显式指定。
 * - getValue() 返回的值已按精度四舍五入，避免 4.249999999998 这种尾巴。
 */
window.Components = window.Components || {};
window.Components.slider = (function () {
  function bandIndex(v, min, max, count) {
    if (v == null) return -1;
    const ratio = (v - min) / (max - min);
    const idx = Math.min(count - 1, Math.max(0, Math.floor(ratio * count)));
    return idx;
  }

  function inferPrecision(step) {
    if (!isFinite(step) || step <= 0) return 0;
    const s = String(step);
    const dot = s.indexOf(".");
    return dot < 0 ? 0 : s.length - dot - 1;
  }

  function round(v, precision) {
    if (v == null || isNaN(v)) return v;
    const f = Math.pow(10, precision);
    return Math.round(v * f) / f;
  }

  function fmt(v, precision) {
    if (v == null) return "";
    const r = round(v, precision);
    // 去掉末尾的 0（4.20 → 4.2），但保留整数显示如 4
    if (precision <= 0) return String(Math.round(r));
    return parseFloat(r.toFixed(precision)).toString();
  }

  function mount(container, props = {}) {
    const min = props.min ?? 1;
    const max = props.max ?? 5;
    const step = props.step ?? 0.01;
    const precision = props.precision ?? inferPrecision(step);
    const labels = props.labels || ["很差", "较差", "一般", "不错", "很好"];
    const allowEmpty = props.allowEmpty !== false;
    const state = {
      value:
        props.value == null
          ? allowEmpty
            ? null
            : round(min, precision)
          : round(Number(props.value), precision),
      onChange: props.onChange || (() => {}),
    };

    const root = UI.el("div", { class: "cmp-slider" });
    const row = UI.el("div", { class: "cmp-slider-row" });

    const rng = UI.el("input", {
      type: "range",
      min: String(min),
      max: String(max),
      step: String(step),
      class: "cmp-slider-range",
    });
    rng.value = state.value == null ? String(min) : String(state.value);

    // 数字输入框，方便手动精确填写
    const numInp = UI.el("input", {
      type: "number",
      min: String(min),
      max: String(max),
      step: String(step),
      class: "cmp-slider-num",
    });

    const valTag = UI.el("span", { class: "cmp-slider-value" });

    const clearBtn = UI.el(
      "button",
      { class: "cmp-slider-clear", type: "button", title: "清空" },
      "清空"
    );

    row.appendChild(rng);
    row.appendChild(numInp);
    row.appendChild(valTag);
    if (allowEmpty) row.appendChild(clearBtn);
    root.appendChild(row);

    const lblRow = UI.el("div", { class: "cmp-slider-labels" });
    labels.forEach((l) => lblRow.appendChild(UI.el("span", {}, l)));
    root.appendChild(lblRow);

    container.appendChild(root);

    function paint() {
      if (state.value == null) {
        valTag.textContent = "未设置";
        valTag.classList.add("muted");
        rng.classList.add("cmp-slider-empty");
        numInp.value = "";
      } else {
        const idx = bandIndex(state.value, min, max, labels.length);
        const shown = fmt(state.value, precision);
        valTag.textContent = `${shown}（${labels[idx] || ""}）`;
        valTag.classList.remove("muted");
        rng.classList.remove("cmp-slider-empty");
        if (document.activeElement !== numInp) numInp.value = shown;
      }
    }

    function setFromRaw(raw, silent) {
      if (raw === "" || raw == null || isNaN(Number(raw))) {
        if (!allowEmpty) return;
        state.value = null;
      } else {
        let n = Number(raw);
        if (n < min) n = min;
        if (n > max) n = max;
        state.value = round(n, precision);
        rng.value = String(state.value);
      }
      paint();
      if (!silent) state.onChange(state.value);
    }

    rng.oninput = () => setFromRaw(rng.value);
    numInp.oninput = () => {
      // 数字框允许临时不合法（如刚输入"4."），不立即截断
      const raw = numInp.value;
      if (raw === "" && allowEmpty) {
        state.value = null;
        paint();
        state.onChange(null);
        return;
      }
      const n = Number(raw);
      if (!isNaN(n)) {
        let v = n;
        if (v < min) v = min;
        if (v > max) v = max;
        state.value = round(v, precision);
        rng.value = String(state.value);
        // 进行中编辑保持 numInp 自由，paint 跳过同步
        const idx = bandIndex(state.value, min, max, labels.length);
        const shown = fmt(state.value, precision);
        valTag.textContent = `${shown}（${labels[idx] || ""}）`;
        valTag.classList.remove("muted");
        rng.classList.remove("cmp-slider-empty");
        state.onChange(state.value);
      }
    };
    numInp.onblur = () => paint();
    clearBtn.onclick = () => {
      state.value = null;
      paint();
      state.onChange(null);
    };

    paint();

    return {
      root,
      getValue: () => state.value,
      setValue: (v) => {
        state.value =
          v == null || v === "" ? null : round(Number(v), precision);
        if (state.value != null) rng.value = String(state.value);
        paint();
      },
      destroy: () => root.remove(),
    };
  }

  return { mount };
})();
