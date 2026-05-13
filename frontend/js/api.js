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

  /**
   * showToast(text, type, options)
   *   - text: 主文案
   *   - type: "info" | "success" | "error"
   *   - options.detail: 副文案（如 "技能 已新增"）
   *   - options.undo:   () => any 撤销回调；存在则显示撤销按钮
   *   - options.duration: 自动关闭毫秒（默认 2600）
   */
  function showToast(text, type = "info", options = {}) {
    const duration = options.duration || (options.undo ? 5000 : 2600);
    toast.innerHTML = "";
    toast.className = "toast " + type;

    const main = document.createElement("div");
    main.className = "toast-main";
    main.textContent = text;
    toast.appendChild(main);

    if (options.detail) {
      const sub = document.createElement("div");
      sub.className = "toast-sub";
      sub.textContent = options.detail;
      toast.appendChild(sub);
    }
    if (typeof options.undo === "function") {
      const btn = document.createElement("button");
      btn.className = "toast-undo";
      btn.textContent = "撤销";
      btn.onclick = () => {
        try {
          options.undo();
        } finally {
          toast.classList.add("hidden");
        }
      };
      toast.appendChild(btn);
    }
    toast.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), duration);
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

/* Meta 缓存：集中读取 /api/enums 与 /api/libraries，供各组件取数。 */
window.Meta = (function () {
  const state = {
    enums: null,
    libraries: null,
    loadingPromise: null,
  };

  async function load(force = false) {
    if (!force && state.enums && state.libraries) return state;
    try {
      const [enums, libs] = await Promise.all([
        API.get("/api/enums"),
        API.get("/api/libraries"),
      ]);
      state.enums = enums.data || {};
      state.libraries = libs.data || {};
    } catch (e) {
      state.enums = state.enums || {};
      state.libraries = state.libraries || {};
      throw e;
    }
    return state;
  }

  function ensure() {
    if (state.enums && state.libraries) return Promise.resolve(state);
    if (state.loadingPromise) return state.loadingPromise;
    state.loadingPromise = load().finally(() => {
      state.loadingPromise = null;
    });
    return state.loadingPromise;
  }

  function refresh() {
    return load(true);
  }

  function enumOptions(name) {
    return (state.enums && state.enums[name]) || [];
  }

  function enumLabel(name, value) {
    const opt = enumOptions(name).find((o) => o.value === value);
    return opt ? opt.label : value;
  }

  function employees() {
    return (state.libraries && state.libraries.employees) || [];
  }
  function departments() {
    return (state.libraries && state.libraries.departments) || [];
  }
  function skills() {
    return (state.libraries && state.libraries.skill_library) || [];
  }
  function scopes() {
    return (state.libraries && state.libraries.scope_library) || [];
  }
  function sprints() {
    return (state.libraries && state.libraries.sprints) || [];
  }

  return {
    get enums() { return state.enums; },
    get libraries() { return state.libraries; },
    ensure,
    refresh,
    enumOptions,
    enumLabel,
    employees,
    departments,
    skills,
    scopes,
    sprints,
  };
})();
