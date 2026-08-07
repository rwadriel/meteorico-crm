# 2. Referência da API

- **Base URL:** `https://zapgrupos-whatsapp-manager.gq2dju.easypanel.host`
- **Autenticação:** header `Authorization: Bearer <token>` em toda chamada. **Nunca** passe o token em query string (vaza em logs de proxy e referer).
- **Formato:** JSON.
- **Somente leitura:** a API não altera o monitoramento nem envia nada pelo WhatsApp.

Erros de autenticação:

| Situação | Resposta |
|---|---|
| Sem header / token errado | `401 { "error": "nao autorizado" }` |
| Token não configurado no servidor | `503 { "error": "integracao nao configurada" }` |

---

## `GET /api/integration/health`

Status e cursor atual.

**Resposta:**
```json
{ "ok": true, "lastSeq": 2722, "events": 2722 }
```

| Campo | Descrição |
|---|---|
| `lastSeq` | Número do último evento (o cursor mais recente disponível) |
| `events` | Total de eventos no log |

Use no primeiro boot para começar do presente (`cursor = lastSeq`).

---

## `GET /api/integration/events`

O feed de eventos. É aqui que a ação acontece.

**Parâmetros (query):**

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `since` | `0` | Cursor. Só retorna eventos com `seq` **maior** que este. |
| `limit` | `500` | Máximo de eventos por página. Teto: `2000`. |
| `only` | (todos) | Filtra por tipo, separado por vírgula. Ex.: `entrou,adicionado` |
| `onlyUnsaved` | `false` | `true` = só eventos com ao menos um contato **não salvo** (`isSaved:false`) |

**Resposta:**
```json
{
  "events": [
    {
      "seq": 2719,
      "event_id": "3f5ab9fb185dcfaf03ed85051103c15f771e95e5",
      "ts": "2026-08-04T16:13:12.518Z",
      "event": "entrou",
      "groupId": "120363411868967783@g.us",
      "groupName": "Música Lucrativa com IA 41",
      "participants": [
        { "id": "558171188315@c.us", "number": "558171188315", "name": "", "isSaved": false }
      ],
      "author": "",
      "detail": "tempo real"
    }
  ],
  "nextSince": 2719,
  "hasMore": false,
  "lastSeq": 2722
}
```

| Campo da resposta | Descrição |
|---|---|
| `events[]` | Os eventos na ordem cronológica (mais antigo → mais novo) |
| `nextSince` | **O cursor a salvar.** Se a página veio vazia, é igual ao `since` que você mandou. |
| `hasMore` | `true` se ainda há mais eventos além do `limit` — chame de novo com `since = nextSince` |
| `lastSeq` | O cursor mais recente do servidor (útil para saber o quanto você está "atrás") |

Ver o significado de cada campo do evento em **[03-modelo-de-dados.md](03-modelo-de-dados.md)**.

### Paginação

Se `hasMore: true`, chame de novo usando o `nextSince` retornado, até `hasMore: false`:

```
GET /events?since=0&limit=2000     → nextSince=2000, hasMore=true
GET /events?since=2000&limit=2000  → nextSince=2722, hasMore=false
```

---

## `GET /api/integration/snapshots`

Estado atual dos grupos (a "foto" mais recente da lista de membros). Serve para você se situar antes de seguir o feed, ou para espelhar a base.

**Sem parâmetro** — índice leve de todos os grupos:
```json
{
  "groups": [
    { "groupId": "120363...@g.us", "groupName": "Música Lucrativa com IA 41", "memberCount": 339, "updatedAt": "2026-08-04T16:36:36.105Z" }
  ]
}
```

**Com `?groupId=<id>`** — a lista completa de membros daquele grupo:
```json
{
  "groups": [
    {
      "groupId": "120363...@g.us",
      "groupName": "Música Lucrativa com IA 41",
      "updatedAt": "2026-08-04T16:36:36.105Z",
      "members": [
        { "id": "558171188315@c.us", "number": "558171188315", "name": "Fulano", "isSaved": false }
      ]
    }
  ]
}
```

> ⚠️ `updatedAt` é quando a **foto foi tirada**, não a data de entrada de ninguém. Trate como linha de base — não invente "entrou antes do monitoramento começar".
