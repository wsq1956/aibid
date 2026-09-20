/* AIBID 静态演示版 · fetch 垫片
 *
 * 线上版（app/server.py）里，前端靠 fetch("/api/...") 向后端取数。
 * 静态版没有后端，于是这里把 window.fetch 换掉：仍然按同样的 URL、同样的
 * JSON 结构作答，只是数据来自 demo-data.js 里固化的导出结果。
 *
 * 这样做的意义：app.js **一行业务代码都不用改**。演示版跑的是与线上
 * 完全相同的前端，不存在「为了演示另写一套界面」——那样演示的就不是
 * 真东西了。
 *
 * 三条纪律：
 *   1. 不伪造任何记录。审定接口直接报错，而不是在前端编一条审计记录 ——
 *      这个系统的全部价值就在于审计链不可篡改，演示版更不能自己破例。
 *   2. 未预置的生成组合返回「阻断」，与真实系统 fail-closed 的行为一致：
 *      查不到事实就不出稿。
 *   3. 数据是导出时真跑出来的，本文件不含任何写死的结果。
 */

(function () {
  "use strict";

  const D = window.DEMO_DATA;
  if (!D) {
    document.addEventListener("DOMContentLoaded", function () {
      const n = document.getElementById("notice");
      if (n) { n.textContent = "未找到 demo-data.js，演示数据加载失败。"; }
    });
    return;
  }

  const realFetch = window.fetch ? window.fetch.bind(window) : null;

  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  /* 从 URL 里取出接口名。
   * 页面上写的是 "/api/status"（相对根），但部署到 GitHub Pages 的子路径
   * 下时浏览器会把它解析成 "https://主机/aibid/api/status"，故不能直接
   * 比字符串，取末段更稳。 */
  function endpoint(url) {
    /* 去掉查询串与哈希后取 /api/xxx 的末段 */
    const path = String(url).split(/[?#]/)[0];
    const m = path.match(/\/api\/([A-Za-z_]+)\/?$/);
    return m ? m[1] : "";
  }

  function blockedReply(template, keyword) {
    const combos = (D.meta && D.meta.模板关键词) || [];
    const list = combos.map(function (c) { return c[0] + "／" + c[1]; }).join("、");
    return {
      draft_id: "",
      keyword: keyword,
      template: template,
      blocked: true,
      status: "BLOCKED",
      snapshot_id: D.status.数据版本,
      generated_by: "",
      sections: [],
      citations: [],
      risk: null,
      reasons: [
        "静态演示版未预置「" + template + "／" + keyword + "」的生成结果 —— "
          + "本页没有后端，无法真的去检索事实库。",
        "可回放的组合：" + list + "。",
        "这不是故障：真实系统查不到事实时同样拒绝出稿（fail-closed），"
          + "此处行为与其一致 —— 阻断是默认行为，放行才需要条件。",
      ],
    };
  }

  window.fetch = function (input, init) {
    const url = (input && input.url) ? input.url : input;
    const name = endpoint(url);
    const method = ((init && init.method) || "GET").toUpperCase();

    /* ---------------------------------------------- 只读接口 */
    if (method === "GET" && name) {
      if (name === "status") { return Promise.resolve(json(D.status)); }
      if (name === "facts") { return Promise.resolve(json(D.facts)); }
      if (name === "opportunities") { return Promise.resolve(json(D.opportunities)); }
      if (name === "drafts") { return Promise.resolve(json(D.drafts)); }
      if (name === "audit") { return Promise.resolve(json(D.audit)); }
    }

    /* ---------------------------------------------- 生成（回放导出结果） */
    if (method === "POST" && name === "generate") {
      let body = {};
      try { body = JSON.parse((init && init.body) || "{}"); } catch (e) { body = {}; }
      const template = String(body.template || "商务标");
      const keyword = String(body.keyword || "").trim();
      const hit = D.generate[template + "|" + keyword];
      if (hit) { return Promise.resolve(json(hit)); }
      return Promise.resolve(json(blockedReply(template, keyword)));
    }

    /* ---------------------------------------------- 审定：明确拒绝 */
    if (method === "POST" && name === "approve") {
      return Promise.resolve(json({
        error: "静态演示版无后端，不能新增审定记录 —— 审计链在导出时已固化。"
             + "要看完整的审定流程，请在本地运行：启动AIBID.bat（Windows）／"
             + "启动AIBID.command（macOS）／启动AIBID.sh（Linux）。",
      }, 403));
    }

    /* 其余请求照旧走真实 fetch */
    if (realFetch) { return realFetch(input, init); }
    return Promise.reject(new Error("静态演示版不支持的请求：" + url));
  };

  /* ---------------------------------------------- 关键词下拉候选
   * 候选直接来自导出数据的 meta，不另抄一份，避免两边对不上。 */
  document.addEventListener("DOMContentLoaded", function () {
    const dl = document.getElementById("kwlist");
    if (!dl || !D.meta) { return; }
    const seen = {};
    (D.meta.模板关键词 || []).forEach(function (c) {
      const kw = c[1];
      if (seen[kw]) { return; }
      seen[kw] = 1;
      const opt = document.createElement("option");
      opt.value = kw;
      dl.appendChild(opt);
    });
  });
})();
