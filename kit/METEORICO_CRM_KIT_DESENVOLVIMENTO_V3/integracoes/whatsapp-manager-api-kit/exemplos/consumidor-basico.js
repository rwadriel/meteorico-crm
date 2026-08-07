// consumidor-basico.js — esqueleto mínimo para seguir o feed.
//
// É o "hello world" da integração: segue o feed e imprime cada entrada.
// Copie e troque o corpo do laço pela sua lógica (gravar, notificar, etc).
//
//   WM_TOKEN=seu_token node consumidor-basico.js

const BASE = process.env.WM_BASE || "https://zapgrupos-whatsapp-manager.gq2dju.easypanel.host";
const TOKEN = process.env.WM_TOKEN;
if (!TOKEN) {
  console.error("Defina WM_TOKEN. Ex.: WM_TOKEN=seu_token node consumidor-basico.js");
  process.exit(1);
}

async function api(path) {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Cursor em memória (para um exemplo). No seu sistema, persista em disco/banco.
let cursor = null;
const jaVistos = new Set();

async function ciclo() {
  if (cursor == null) cursor = (await api("/api/integration/health")).lastSeq; // começa do presente

  let seguir = true;
  while (seguir) {
    const r = await api(`/api/integration/events?since=${cursor}&only=entrou,adicionado&limit=2000`);
    for (const ev of r.events) {
      if (jaVistos.has(ev.event_id)) continue; // idempotência
      jaVistos.add(ev.event_id);
      for (const c of ev.participants) {
        if (!c.number) continue;
        // >>> AQUI vai a SUA lógica <<<
        console.log(`entrou: +${c.number} ${c.name || ""} em "${ev.groupName}" (isSaved=${c.isSaved})`);
      }
    }
    cursor = r.nextSince;
    seguir = r.hasMore;
  }
}

console.log("Seguindo o feed... (Ctrl+C para sair)");
ciclo().catch((e) => console.error(e.message));
setInterval(() => ciclo().catch((e) => console.error(e.message)), 10000);
