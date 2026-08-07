// painel.js — painel web simples para ver e exportar os contatos do CRM.
// Node puro (http nativo). Abre em http://localhost:<PORTA>.
import http from "http";
import { cfg } from "./feed.js";
import { listar, total, porGrupo, todosParaCsv } from "./db.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function paginaHtml(busca) {
  const contatos = listar({ busca });
  const grupos = porGrupo();
  const linhas = contatos
    .map(
      (c) => `<tr>
        <td>${esc(c.nome) || '<span class="m">(sem nome)</span>'}</td>
        <td>+${esc(c.numero)}</td>
        <td>${esc(c.ultimo_grupo)}</td>
        <td>${esc(c.grupos)}</td>
        <td>${esc(new Date(c.ultima_entrada).toLocaleString("pt-BR"))}</td>
        <td>${esc(c.status)}</td>
      </tr>`
    )
    .join("");

  const chips = grupos
    .slice(0, 12)
    .map((g) => `<span class="chip">${esc(g.grupo)} · ${g.n}</span>`)
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM de Grupos</title>
<style>
  :root{--bg:#0b0b0e;--card:#151519;--bd:#2a2a34;--tx:#f2f2f5;--mut:#8f8f9c;--lima:#cdf463;--ink:#171a0b}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--tx);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px}
  .wrap{max-width:1100px;margin:0 auto}
  h1{font-size:20px;margin-bottom:4px}
  .sub{color:var(--mut);font-size:13px;margin-bottom:18px}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:18px;margin-bottom:16px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  input{flex:1;min-width:200px;background:#1e1e25;border:1px solid var(--bd);color:var(--tx);border-radius:12px;padding:11px 14px;font-size:14px}
  input:focus{outline:2px solid var(--lima);outline-offset:-1px;border-color:transparent}
  a.btn{background:var(--lima);color:var(--ink);text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;font-size:13px}
  .chip{display:inline-block;background:#1e1e25;border:1px solid var(--bd);color:var(--mut);border-radius:999px;padding:5px 12px;font-size:12px;margin:0 6px 6px 0}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--bd)}
  th{color:var(--mut);text-transform:uppercase;font-size:11px;letter-spacing:.04em}
  .m{color:var(--mut)}
  .big{font-size:32px;font-weight:700;color:var(--lima)}
</style></head><body><div class="wrap">
  <h1>📇 CRM de Grupos</h1>
  <div class="sub">Contatos coletados do feed do WhatsApp Manager</div>

  <div class="card">
    <div class="big">${total()}</div>
    <div class="m">contatos na base</div>
    <div style="margin-top:12px">${chips}</div>
  </div>

  <div class="card">
    <form class="row" method="get">
      <input name="q" placeholder="🔎 buscar por nome, número ou grupo..." value="${esc(busca)}">
      <a class="btn" href="/export.csv">⬇ Exportar CSV</a>
    </form>
  </div>

  <div class="card">
    <table>
      <thead><tr><th>Nome</th><th>Número</th><th>Último grupo</th><th>Grupos</th><th>Última entrada</th><th>Status</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="6" class="m">Nenhum contato ainda. Deixe o coletor (node index.js) rodando.</td></tr>'}</tbody>
    </table>
  </div>
</div></body></html>`;
}

function csv() {
  const rows = todosParaCsv();
  const head = "numero;nome;primeiro_grupo;primeira_entrada;ultimo_grupo;ultima_entrada;grupos;status";
  const body = rows
    .map((c) =>
      [c.numero, c.nome, c.primeiro_grupo, c.primeira_entrada, c.ultimo_grupo, c.ultima_entrada, c.grupos, c.status]
        .map((v) => String(v ?? "").replace(/;/g, ","))
        .join(";")
    )
    .join("\n");
  return "﻿" + head + "\n" + body + "\n";
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/export.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="crm-contatos.csv"',
      });
      return res.end(csv());
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(paginaHtml(url.searchParams.get("q") || ""));
  })
  .listen(cfg.porta, () => {
    console.log(`Painel do CRM em http://localhost:${cfg.porta}`);
  });
