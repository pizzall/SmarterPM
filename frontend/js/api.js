/* 全局 API 与工具函数 */
window.API = (function () {
  async function request(method, url, body, options = {}) {
    const init = { method, headers: {} };
    if (body !== undefined && !(body instanceof FormData)) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      init.body = body;
    }
    const res = await fetch(url, init);
    let payload = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      payload = await res.json();
    } else if (options.raw) {
      return await res.blob();
    } else {
      payload = { ok: res.ok, message: await res.text() };
    }
    if (!res.ok) {
      throw new Error(payload.detail || payload.message || `请求失败: ${res.status}`);
    }
    return payload;
  }

  return {
    get: (url) => request("GET", url),
    post: (url, body) => request("POST", url, body),
    put: (url, body) => request("PUT", url, body),
    patch: (url, body) => request("PATCH", url, body),
    del: (url) => request("DELETE", url),
    upload: (url, file) => {
      const fd = new FormData();
      fd.append("file", file);
      return request("POST", url, fd);
    },
    download: (url) => request("GET", url, undefined, { raw: true }),
  };
})();

window.UI = (function () {
  const toast = document.getElementById("toast");
  let toastTimer = null;

  function showToast(text, type = "info") {
    toast.textContent = text;
    toast.className = "toast " + type;
    toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
  }

  function escape(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== undefined && v !== null) {
        node.setAttribute(k, v);
      }
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  return { showToast, escape, el };
})();
