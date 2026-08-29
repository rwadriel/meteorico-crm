// index.js — coletor do CRM.
//
// Segue o feed do WhatsApp Manager e registra na base cada número que
// entra num grupo. Dedup por número (upsert): a mesma pessoa em vários
// grupos é uma linha só. Retoma do cursor salvo se reiniciar.
import { cfg, health, eventos } from "./feed.js";
import { getCursor, setCursor, registrarEntrada, total } from "./db.js";

async function bootCursor() {
  let cursor = getCursor();
  if (cursor != null) return cursor;

  if (cfg.importarHistorico) {
    console.log("Primeiro boot: importando histórico (cursor = 0)...");
    return 0;
  }
  const h = await health();
  console.log(`Primeiro boot: começando do presente (cursor = ${h.lastSeq}).`);
  setCursor(h.lastSeq);
  return h.lastSeq;
}

async function drenar(cursor) {
  // Consome todas as páginas disponíveis antes de dormir.
  let novos = 0;
  let atualizados = 0;
  let seguir = true;

  while (seguir) {
    const r = await eventos({ since: cursor, only: "entrou,adicionado" });
    for (const ev of r.events) {
      for (const c of ev.participants) {
        if (!c.number) continue;
        const { novo } = registrarEntrada({
          numero: c.number,
          nome: c.name,
          grupo: ev.groupName,
          ts: ev.ts,
        });
        if (novo) novos++;
        else atualizados++;
      }
    }
    cursor = r.nextSince;
    setCursor(cursor);
    seguir = r.hasMore;
  }

  if (novos || atualizados) {
    console.log(
      `[${new Date().toLocaleTimeString("pt-BR")}] +${novos} novo(s), ${atualizados} atualização(ões) — base: ${total()} contatos.`
    );
  }
  return cursor;
}

async function main() {
  console.log("CRM de grupos — coletor iniciado.");
  console.log(`Fonte: ${cfg.base}`);
  let cursor = await bootCursor();

  // Primeira drenagem imediata, depois no intervalo.
  cursor = await drenar(cursor).catch((e) => (console.error("erro:", e.message), cursor));

  setInterval(async () => {
    try {
      cursor = await drenar(cursor);
    } catch (e) {
      console.error("erro no feed:", e.message); // não derruba o coletor
    }
  }, cfg.intervalo * 1000);
}

main();
