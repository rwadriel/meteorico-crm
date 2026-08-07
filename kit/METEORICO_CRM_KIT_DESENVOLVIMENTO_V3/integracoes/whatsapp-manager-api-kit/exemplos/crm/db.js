// db.js — base de contatos do CRM, em SQLite (node:sqlite, embutido no Node).
//
// A chave é o número normalizado: cada pessoa é uma linha só, mesmo que
// entre em vários grupos. Guardamos o primeiro grupo/entrada e também o
// último, além de um status editável.
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(DIR, "crm.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS contatos (
    numero        TEXT PRIMARY KEY,
    nome          TEXT DEFAULT '',
    primeiro_grupo TEXT DEFAULT '',
    primeira_entrada TEXT DEFAULT '',
    ultimo_grupo   TEXT DEFAULT '',
    ultima_entrada TEXT DEFAULT '',
    grupos         INTEGER DEFAULT 1,
    status         TEXT DEFAULT 'novo'
  );

  CREATE TABLE IF NOT EXISTS estado (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

// ── Cursor (para o feed retomar de onde parou) ──
export function getCursor() {
  const row = db.prepare("SELECT valor FROM estado WHERE chave = 'cursor'").get();
  return row ? Number(row.valor) : null;
}

export function setCursor(seq) {
  db.prepare(
    "INSERT INTO estado (chave, valor) VALUES ('cursor', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor"
  ).run(String(seq));
}

// ── Upsert de contato ──
// Insere se novo; se já existe, atualiza último grupo/entrada e conta +1 grupo.
const upsert = db.prepare(`
  INSERT INTO contatos (numero, nome, primeiro_grupo, primeira_entrada, ultimo_grupo, ultima_entrada, grupos, status)
  VALUES (@numero, @nome, @grupo, @ts, @grupo, @ts, 1, 'novo')
  ON CONFLICT(numero) DO UPDATE SET
    nome = CASE WHEN excluded.nome != '' THEN excluded.nome ELSE contatos.nome END,
    ultimo_grupo = excluded.ultimo_grupo,
    ultima_entrada = excluded.ultima_entrada,
    grupos = contatos.grupos + 1
`);

export function registrarEntrada({ numero, nome, grupo, ts }) {
  if (!numero) return { novo: false };
  const existia = db.prepare("SELECT 1 FROM contatos WHERE numero = ?").get(numero);
  upsert.run({ numero, nome: nome || "", grupo: grupo || "", ts: ts || new Date().toISOString() });
  return { novo: !existia };
}

// ── Consultas para o painel ──
export function listar({ busca = "", limit = 500 } = {}) {
  if (busca) {
    return db
      .prepare(
        "SELECT * FROM contatos WHERE numero LIKE ? OR nome LIKE ? OR ultimo_grupo LIKE ? ORDER BY ultima_entrada DESC LIMIT ?"
      )
      .all(`%${busca}%`, `%${busca}%`, `%${busca}%`, limit);
  }
  return db.prepare("SELECT * FROM contatos ORDER BY ultima_entrada DESC LIMIT ?").all(limit);
}

export function total() {
  return db.prepare("SELECT COUNT(*) AS n FROM contatos").get().n;
}

export function porGrupo() {
  return db
    .prepare("SELECT ultimo_grupo AS grupo, COUNT(*) AS n FROM contatos GROUP BY ultimo_grupo ORDER BY n DESC")
    .all();
}

export function todosParaCsv() {
  return db.prepare("SELECT * FROM contatos ORDER BY ultima_entrada DESC").all();
}
