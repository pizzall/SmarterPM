/* tooltip：给元素添加 hover 提示。
 *
 *   Components.tooltip.attach(el, "字段说明…");
 */
window.Components = window.Components || {};
window.Components.tooltip = (function () {
  let bubble = null;

  function ensureBubble() {
    if (bubble) return bubble;
    bubble = UI.el("div", { class: "cmp-tooltip hidden" });
    document.body.appendChild(bubble);
    return bubble;
  }

  function show(el, text) {
    const b = ensureBubble();
    b.textContent = text;
    b.classList.remove("hidden");
    const rect = el.getBoundingClientRect();
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    let left = rect.left + rect.width / 2 - bw / 2;
    let top = rect.bottom + 6;
    if (top + bh > window.innerHeight - 8) top = rect.top - bh - 6;
    if (left < 8) left = 8;
    if (left + bw > window.innerWidth - 8) left = window.innerWidth - 8 - bw;
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
  }

  function hide() {
    if (bubble) bubble.classList.add("hidden");
  }

  function attach(el, text) {
    if (!el || !text) return;
    el.classList.add("has-tooltip");
    el.addEventListener("mouseenter", () => show(el, text));
    el.addEventListener("focus", () => show(el, text));
    el.addEventListener("mouseleave", hide);
    el.addEventListener("blur", hide);
  }

  return { attach, show, hide };
})();
