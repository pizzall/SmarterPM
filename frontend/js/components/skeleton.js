/* Skeleton loading：替换原"加载中…"。
 *
 *   Components.skeleton.list(container, 5);      // 5 行
 *   Components.skeleton.card(container);         // 单卡片
 *   Components.skeleton.table(container, 5, 4);  // 5 行 4 列
 */
window.Components = window.Components || {};
window.Components.skeleton = (function () {
  function bar(extra = "") {
    return `<div class="cmp-skel-bar ${extra}"></div>`;
  }

  function list(container, n = 4) {
    container.innerHTML = `<div class="cmp-skel-wrap">${Array.from({
      length: n,
    })
      .map(
        () =>
          `<div class="cmp-skel-row">${bar("w-30")}${bar("w-60")}${bar("w-20")}</div>`
      )
      .join("")}</div>`;
  }

  function card(container) {
    container.innerHTML = `
      <div class="cmp-skel-wrap">
        ${bar("h-24 w-40")}
        ${bar("w-90")}
        ${bar("w-80")}
        ${bar("w-70")}
      </div>`;
  }

  function table(container, rows = 5, cols = 4) {
    let html = '<div class="cmp-skel-wrap">';
    for (let r = 0; r < rows; r++) {
      html += '<div class="cmp-skel-row">';
      for (let c = 0; c < cols; c++) {
        html += bar(`w-${20 + ((c + r) % 4) * 15}`);
      }
      html += "</div>";
    }
    html += "</div>";
    container.innerHTML = html;
  }

  return { list, card, table };
})();
