/* 全局自由对话浮窗（需求 8）。 */
window.Views = window.Views || {};
window.Views.chat = (function () {
  let state = { cid: null, history: [] };

  function append(role, content) {
    const messages = document.getElementById("chat-messages");
    const div = UI.el("div", { class: `chat-msg ${role}` });
    div.innerHTML = `<div class="role">${role === "user" ? "我" : "AI"}</div><div class="bubble">${UI.escape(content)}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function bind() {
    const fab = document.getElementById("chat-fab");
    const panel = document.getElementById("chat-panel");
    const close = document.getElementById("chat-close");
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");

    fab.onclick = () => {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden") && !state.history.length) {
        append("assistant", "你好，我可以基于当前组织 / 任务 / 方案数据回答问题或给出建议。例如：\n· 张三最近适合参与什么任务？\n· task_042 的方案有什么风险？\n· 建议把 emp_005 的沟通调高");
      }
    };
    close.onclick = () => panel.classList.add("hidden");

    form.onsubmit = async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      append("user", text);
      try {
        const res = await API.post("/api/chat", {
          user_message: text,
          conversation_id: state.cid,
        });
        state.cid = res.data.conversation_id;
        append("assistant", res.data.reply || "(无回复)");
        if ((res.data.suggested_actions || []).length) {
          append("assistant", "建议操作：\n" + res.data.suggested_actions.map((a, i) => `${i + 1}. ${a.summary}`).join("\n"));
        }
      } catch (err) {
        append("assistant", "出错：" + err.message);
      }
    };
  }

  return { bind };
})();
