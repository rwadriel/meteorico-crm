# CRM de Grupos

CRM de leads alimentado pelo feed do WhatsApp Manager. Cada número que entra em qualquer grupo vira um contato na sua base — sem duplicar, mesmo que a pessoa esteja em vários grupos.

**Node puro**, sem dependências para instalar (usa `node:sqlite`, embutido). Requer **Node 22.5+** (você tem 24, então ok).

## Rodar

```bash
cp .env.example .env
# edite o .env: cole seu token em WM_TOKEN

node index.js       # o coletor: segue o feed e preenche a base
```

Em outro terminal:

```bash
node painel.js      # painel web em http://localhost:4080
```

Deixe o `index.js` rodando o tempo todo (é ele que coleta). O painel você abre quando quiser ver/exportar.

## O que cada arquivo faz

| Arquivo | Papel |
|---|---|
| `index.js` | Coletor: segue o feed com cursor e faz upsert dos contatos |
| `feed.js` | Cliente da API (lê o `.env`, pagina os eventos) |
| `db.js` | Base SQLite (`crm.db`): contatos + cursor |
| `painel.js` | Painel web: lista, busca e exporta CSV |
| `.env` | Sua configuração (token, URL, opções) |

## Configuração (.env)

| Variável | Descrição |
|---|---|
| `WM_BASE` | URL do WhatsApp Manager |
| `WM_TOKEN` | Seu token de integração |
| `INTERVALO` | Segundos entre leituras (padrão 10) |
| `IMPORTAR_HISTORICO` | `1` = importa todos os leads que já entraram; `0` = só novos |
| `PORTA` | Porta do painel (padrão 4080) |

## A base de dados

Tabela `contatos` (chave = número normalizado):

| Coluna | |
|---|---|
| `numero` | telefone (só dígitos) |
| `nome` | nome público, quando houver |
| `primeiro_grupo` / `primeira_entrada` | onde e quando apareceu pela primeira vez |
| `ultimo_grupo` / `ultima_entrada` | e a última vez |
| `grupos` | em quantos grupos já entrou |
| `status` | editável (`novo` por padrão) — use para o seu funil |

O arquivo `crm.db` é um SQLite normal: você pode abrir com qualquer ferramenta (DB Browser for SQLite, TablePlus) e rodar SQL à vontade.

## Como evoluir

Este é um ponto de partida. Ideias:

- **Funil:** use a coluna `status` (`novo` → `contatado` → `cliente`).
- **Segmentação:** extraia DDD do número, filtre por grupo/período.
- **Boas-vindas:** troque `only=entrou,adicionado` por `...&onlyUnsaved=true` e, em vez de só gravar, dispare sua ação (com atraso anti-ban se for mensagem no WhatsApp).
- **Recuperação:** um segundo coletor com `only=saiu,removido` marcando quem saiu.
- **Cruzamento:** junte com suas outras bases (Eduzz, Nutror) pelo número.

Veja `../../docs/04-casos-de-uso.md` para as receitas.
