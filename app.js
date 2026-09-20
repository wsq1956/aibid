/* AIBID 工作台 · 前端逻辑
 *
 * 本文件最要紧的一段是 renderDraft()：把初稿渲染成带引用高亮的 HTML。
 * 服务端给出的 Citation 偏移是相对「各章节以 \n 连接后的全文」的，
 * 所以要先按章节基准偏移把它换算到段内，再把每段切成
 * [普通文字][引用][普通文字]… 依次输出。
 *
 * 为什么要做到这个程度：M4-② 要求「引用正确率 100%」。一个看不见的
 * 100% 和没有差不多；把每处事实都标出来、点开就能看到 fact_id 与
 * 证书原件，这个承诺才是可检验的。 */

const $ = (s) => document.querySelector(s);

/* ------------------------------------------------------------ 工具 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({ error: "响应不是合法 JSON" }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, isErr) {
  const n = $("#notice");
  n.style.background = isErr ? "#FAF0EF" : "#EAF6F9";
  n.style.color = isErr ? "#7A3B36" : "#1E5E86";
  n.style.borderColor = isErr ? "#E8C4C0" : "#C4E2EC";
  n.textContent = msg;
}

/* ------------------------------------------------------------ 标签页 */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    $("#view-" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "audit") loadAudit();
    if (btn.dataset.view === "facts") loadFacts();
  });
});

/* ------------------------------------------------------------ 弹窗 */
function openModal(html) {
  $("#modalBody").innerHTML = html;
  $("#modal").classList.add("open");
}
$("#modalClose").addEventListener("click", () => $("#modal").classList.remove("open"));
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") $("#modal").classList.remove("open");
});

/* ------------------------------------------------------------ 系统状态 */
async function loadStatus() {
  try {
    const s = await api("/api/status");
    $("#status").textContent = `事实 ${s.事实总数} 条 · 审计 ${s.审计记录} 条`;
    $("#notice").textContent = s.声明;
  } catch (e) {
    toast("无法连接服务：" + e.message, true);
  }
}

/* ------------------------------------------------------------ 今日机会 */
const VERDICTS = ["推荐", "不推荐", "待定"];

async function loadOpps() {
  const list = $("#oppsList");
  list.innerHTML = '<div class="spin">加载中…</div>';
  let items;
  try {
    items = await api("/api/opportunities");
  } catch (e) {
    list.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
    return;
  }

  /* 三档完整性 —— PRD M2-① 缺档即当日验收不通过，故在界面上直接标红 */
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  items.forEach((o) => { if (counts[o.verdict] !== undefined) counts[o.verdict]++; });
  const missing = VERDICTS.filter((v) => counts[v] === 0);

  $("#verdictbar").innerHTML =
    VERDICTS.map(
      (v) => `<div class="vchip ${counts[v] === 0 ? "miss" : ""}">
        <div class="n">${counts[v]}</div><div class="l">${v}${counts[v] === 0 ? " · 缺档" : ""}</div>
      </div>`
    ).join("") +
    `<div class="vchip ${missing.length ? "miss" : ""}">
       <div class="n" style="font-size:15px">${missing.length ? "不通过" : "通过"}</div>
       <div class="l">三档完整性</div>
     </div>`;

  list.innerHTML = items.map((o) => `
    <div class="opp ${esc(o.verdict)}">
      <div class="row1">
        <span class="title">${esc(o.title)}</span>
        <span class="badge ${esc(o.verdict)}">${esc(o.verdict)}</span>
        <span class="score">匹配度 ${o.score.toFixed(1)} · ${esc(o.notice_id)}</span>
      </div>
      <div class="reason">研判依据：${o.reasons.map(esc).join("；")}</div>
      ${o.matched.length ? `<div class="matched">匹配到的资质业绩：${
        o.matched.map((m) => `<span class="tag">${esc(m.title)}</span>`).join("")
      }</div>` : ""}
    </div>`).join("");
}

/* ------------------------------------------------------------ 资质业绩库 */
const KINDS = ["", "qualification", "certificate", "patent", "project"];
const KIND_LABEL = { "": "全部", qualification: "资质类别", certificate: "资质证书",
                     patent: "专利", project: "工程业绩" };
let factKind = "";

async function loadFacts() {
  $("#factFilter").innerHTML = KINDS.map(
    (k) => `<button class="${k === factKind ? "on" : ""}" data-k="${k}">${KIND_LABEL[k]}</button>`
  ).join("");
  $("#factFilter").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => { factKind = b.dataset.k; loadFacts(); });
  });

  const box = $("#factsList");
  box.innerHTML = '<div class="spin">加载中…</div>';
  let items;
  try {
    items = await api("/api/facts");
  } catch (e) {
    box.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
    return;
  }
  if (factKind) items = items.filter((f) => f.kind === factKind);
  if (!items.length) { box.innerHTML = '<div class="empty">暂无数据</div>'; return; }

  box.innerHTML = items.map((f) => `
    <div class="fact">
      <div class="top">
        <span class="fid">${esc(f.fact_id)}</span>
        <span class="ttl">${esc(f.title)}</span>
        <span class="tag">${esc(f.kind_label)}</span>
        <span class="score">v${f.version}</span>
      </div>
      <div class="meta">${esc(f.issuer)} · ${esc(f.issued_at)} · 编号 ${esc(f.ref_no || "—")}</div>
      <div class="rendered">${esc(f.rendered)}</div>
    </div>`).join("");
}

/* ------------------------------------------------------------ 标书生成 */

/* 把引用偏移从「全文」换算到「段内」，并按段切分渲染。
 *
 * plain_text() 是 sections 以 \n 连接，故第 i 段的基准偏移为
 * 前面各段长度之和 + i 个换行符 —— 与后端 Composer 的游标推进一致。 */
function renderDraft(sections, citations) {
  const bases = [];
  let cursor = 0;
  sections.forEach((s, i) => {
    bases.push(cursor);
    cursor += s.text.length + (i < sections.length - 1 ? 1 : 0);
  });

  return sections.map((sec, i) => {
    const base = bases[i], end = base + sec.text.length;
    const local = citations
      .filter((c) => c.start >= base && c.end <= end)
      .sort((a, b) => a.start - b.start);

    let html = "", pos = base;
    for (const c of local) {
      if (c.start < pos) continue;              // 防重叠导致乱序
      html += esc(sec.text.slice(pos - base, c.start - base));
      html += `<span class="cite" data-fid="${esc(c.fact_id)}">` +
              esc(sec.text.slice(c.start - base, c.end - base)) + `</span>`;
      pos = c.end;
    }
    html += esc(sec.text.slice(pos - base));
    return `<h4>${esc(sec.heading)}</h4><p>${html}</p>`;
  }).join("");
}

function showCitation(c) {
  openModal(`
    <h3>事实溯源</h3>
    <div class="kv">
      <div class="k">事实编号</div><div class="v mono">${esc(c.fact_id)}</div>
      <div class="k">事实名称</div><div class="v">${esc(c.title)}</div>
      <div class="k">类别</div><div class="v">${esc(c.kind)}</div>
      <div class="k">签发时间</div><div class="v">${esc(c.issued_at)}</div>
      <div class="k">证书原件</div><div class="v mono">${esc(c.evidence_uri)}</div>
      <div class="k">文本位置</div><div class="v mono">[${c.start}, ${c.end})</div>
    </div>
    <div class="quote">${esc(c.rendered)}</div>
    <p style="color:#5B6B7B;font-size:12.5px;margin-top:12px">
      这段文字是逐字从资质业绩库复制的 —— 模型从未获得改写它的权限。
      回查器会将本段与库中记录逐字比对，任何偏差都会阻断出稿。
    </p>`);
}

async function doGenerate() {
  const btn = $("#btnGen");
  const box = $("#genResult");
  const keyword = $("#kw").value.trim();
  if (!keyword) { toast("请填写项目关键词", true); return; }

  btn.disabled = true;
  box.innerHTML = '<div class="panel"><div class="spin">生成中，正在回查事实引用…</div></div>';
  try {
    const r = await api("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: $("#tpl").value, keyword, actor: $("#actor").value.trim() || "投标专员",
      }),
    });

    if (r.blocked) {
      box.innerHTML = `
        <div class="blockedbox">
          <h3>已阻断出稿 —— 回查未通过</h3>
          <p style="margin:0;color:#7A3B36;font-size:13px">
            系统在事实引用被核验之前不会交出任何初稿。共 ${r.reasons.length} 项问题：
          </p>
          <ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>
        <div class="panel">
          <p style="margin:0;color:#5B6B7B;font-size:13px">
            这不是故障，而是设计：<b>阻断是默认行为，放行才需要条件</b>。
            本次阻断已写入审计日志。
          </p>
        </div>`;
      loadStatus();
      return;
    }

    const risk = r.risk || { coverage: 0, checked: 0, findings: [] };
    box.innerHTML = `
      <div class="result-head">
        <span class="pill ok">回查通过</span>
        <span style="color:#5B6B7B;font-size:13px">
          引用 ${r.citations.length} 处事实，全部逐字核对无误 ·
          数据版本 ${esc(r.snapshot_id)} · 生成人 ${esc(r.generated_by)}
        </span>
      </div>
      <div class="draft">${renderDraft(r.sections, r.citations)}</div>
      <div class="riskbox">
        <h3>合规自检 · 12 类废标风险点</h3>
        <p style="margin:0;font-size:13px">
          覆盖率 <b>${(risk.coverage * 100).toFixed(0)}%</b>（已执行 ${risk.checked} 类）
          ${risk.findings.length
            ? `· 命中 <b style="color:#C04A3F">${risk.findings.length}</b> 项，需人工处理：`
            : `· <span class="ok">未命中风险点</span>`}
        </p>
        ${risk.findings.length ? `<ul style="margin:8px 0 0;padding-left:20px;font-size:13px">
          ${risk.findings.map((f) =>
            `<li><b>${esc(f.code)}</b>｜定位：${esc(f.located)}｜${esc(f.detail)}</li>`).join("")}
        </ul>` : ""}
      </div>
      <div class="panel" style="margin-top:14px">
        <p style="margin:0;color:#5B6B7B;font-size:13px">
          点击正文中<span class="cite">带下划线的高亮文字</span>可查看该处事实的
          编号、来源与证书原件。这些文字由程序直接拼接，<b>不经过模型</b>。
        </p>
      </div>`;

    box.querySelectorAll(".cite").forEach((el) => {
      el.addEventListener("click", () => {
        const c = r.citations.find((x) => x.fact_id === el.dataset.fid);
        if (c) showCitation(c);
      });
    });
    loadStatus();
  } catch (e) {
    box.innerHTML = `<div class="panel"><div class="empty">生成失败：${esc(e.message)}</div></div>`;
  } finally {
    btn.disabled = false;
  }
}

$("#btnGen").addEventListener("click", doGenerate);

/* ------------------------------------------------------------ 审计留痕 */
async function loadAudit() {
  const sum = $("#auditSummary");
  sum.innerHTML = '<div class="spin">加载中…</div>';
  let a, drafts;
  try {
    [a, drafts] = await Promise.all([api("/api/audit"), api("/api/drafts")]);
  } catch (e) {
    sum.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
    return;
  }

  sum.innerHTML = `<div class="summary">
    <div class="sum ${a.chain_ok ? "ok" : "bad"}">
      <div class="n">${a.chain_ok ? "完整" : "断裂"}</div>
      <div class="l">哈希链（${a.length} 条记录）</div>
    </div>
    <div class="sum ${a.quadruple_complete ? "ok" : "bad"}">
      <div class="n">${a.quadruple_complete ? "齐全" : a.missing.length + " 份缺"}</div>
      <div class="l">四元组完整率</div>
    </div>
    <div class="sum"><div class="n">${drafts.length}</div><div class="l">已生成初稿</div></div>
  </div>
  <div class="panel"><p style="margin:0;font-size:13px;color:#5B6B7B">
    ${esc(a.chain_summary)}
  </p></div>`;

  $("#draftsList").innerHTML = drafts.length
    ? `<table><tr><th>初稿编号</th><th>项目</th><th>引用</th><th>数据版本</th><th>审定人</th><th>操作</th></tr>
       ${drafts.map((d) => `<tr>
         <td class="mono">${esc(d.draft_id)}</td>
         <td>${esc(d.keyword)}</td>
         <td>${d.citations}</td>
         <td class="mono">${esc(d.snapshot_id)}</td>
         <td>${d.完整 ? esc(d.审定人) : '<span style="color:#C04A3F">待审定</span>'}</td>
         <td>${d.完整 ? "—" : `<button data-approve="${esc(d.draft_id)}">审定</button>`}</td>
       </tr>`).join("")}</table>`
    : '<div class="empty">还没有生成过初稿。到「标书生成」页试试。</div>';

  $("#draftsList").querySelectorAll("[data-approve]").forEach((b) => {
    b.addEventListener("click", async () => {
      const who = prompt("请输入审定人姓名（不得与生成人相同）：");
      if (!who) return;
      try {
        await api("/api/approve", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_id: b.dataset.approve, reviewer: who.trim() }),
        });
        toast("审定已记录，四元组补齐。");
        loadAudit();
      } catch (e) { toast(e.message, true); }
    });
  });

  $("#auditLog").innerHTML = a.records.length
    ? `<table><tr><th>#</th><th>时间</th><th>操作人</th><th>动作</th><th>本记录哈希</th><th>前条哈希</th></tr>
       ${a.records.slice().reverse().map((r) => `<tr>
         <td>${r.seq}</td><td>${esc(r.ts)}</td><td>${esc(r.actor)}</td>
         <td>${esc(r.action)}</td>
         <td class="mono">${esc(r.hash)}</td><td class="mono">${esc(r.prev)}</td>
       </tr>`).join("")}</table>`
    : '<div class="empty">暂无审计记录</div>';
}

/* ------------------------------------------------------------ 启动 */
loadStatus();
loadOpps();
