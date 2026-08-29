// feed.js — cliente do feed do WhatsApp Manager.
//
// Lê variáveis do .env (sem dependência: um parser mínimo), e expõe uma
// função para paginar os eventos a partir de um cursor.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

// Carrega .env para process.env (só o que ainda não estiver definido).
function carregarEnv() {
  const arq = path.join(DIR, ".env");
  if (!fs.existsSync(arq)) return;
  for (const linha of fs.readFileSync(arq, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
carregarEnv();

export const cfg = {
  base: (process.env.WM_BASE || "").replace(/\/+$/, ""),
  token: process.env.WM_TOKEN || "",
  intervalo: Number(process.env.INTERVALO || 10),
  importarHistorico: process.env.IMPORTAR_HISTORICO === "1",
  porta: Number(process.env.PORTA || 4080),
};

if (!cfg.base || !cfg.token) {
  console.error("Falta WM_BASE ou WM_TOKEN no .env (copie de .env.example).");
  process.exit(1);
}

async function api(pathname) {
  const res = await fetch(cfg.base + pathname, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${pathname}`);
  return res.json();
}

export async function health() {
  return api("/api/integration/health");
}

// Busca uma página de eventos a partir do cursor.
export async function eventos({ since, only = "entrou,adicionado", onlyUnsaved = false, limit = 2000 }) {
  const q = new URLSearchParams({ since: String(since), only, limit: String(limit) });
  if (onlyUnsaved) q.set("onlyUnsaved", "true");
  return api("/api/integration/events?" + q.toString());
}

export async function snapshots(groupId) {
  return api("/api/integration/snapshots" + (groupId ? "?groupId=" + encodeURIComponent(groupId) : ""));
}
