# 3. Modelo de dados

## O objeto Evento

```json
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
```

| Campo | Tipo | Descrição |
|---|---|---|
| `seq` | número | Posição no log. É o **cursor**. Sempre crescente. |
| `event_id` | string | Id **determinístico** (hash do conteúdo). Use para **deduplicar** — reprocessar o mesmo evento dá o mesmo id. |
| `ts` | string ISO 8601 | Quando ocorreu (UTC). |
| `event` | string | Tipo do evento (ver tabela abaixo). |
| `groupId` | string | Id interno do grupo (`...@g.us`). |
| `groupName` | string | Nome do grupo. |
| `participants` | array | Quem entrou/saiu. Pode ter mais de um. |
| `author` | string | Quem executou a ação (em adição/remoção). Vazio quando a pessoa entrou/saiu sozinha. |
| `detail` | string | Origem do evento: `"tempo real"` ou `"varredura periódica"`. |

## Tipos de evento (`event`)

| Valor | Significado |
|---|---|
| `entrou` | Entrou no grupo por conta própria |
| `adicionado` | Foi adicionado por alguém (veja `author`) |
| `saiu` | Saiu por conta própria |
| `removido` | Foi removido por alguém (veja `author`) |
| `baseline` | Foto inicial de um grupo (primeira vez que o monitor viu o grupo) |
| `grupo_criado` | Um grupo novo foi criado |
| `alteracao` | Mudança no grupo (nome, descrição etc.) |

Para leads/CRM e boas-vindas, os que interessam são **`entrou`** e **`adicionado`**. Para recuperação, **`saiu`** e **`removido`**.

## O participante

```json
{ "id": "558171188315@c.us", "number": "558171188315", "name": "Fulano", "isSaved": false }
```

| Campo | Descrição |
|---|---|
| `id` | Id interno no WhatsApp (`...@c.us` ou `...@lid`). Estável, sempre presente. |
| `number` | Telefone real, só dígitos. **Pode ser `null`** quando o WhatsApp não resolve o número (LID) — nesse caso não há como salvar/contatar. |
| `name` | Nome público (pushname) quando disponível; pode vir vazio. |
| `isSaved` | `true` se o número já está na sua base de contatos salvos do painel. `false` = contato novo. |

### Sobre `number` nulo

Nem todo membro tem o telefone resolvível — o WhatsApp identifica alguns só por LID. Nesses casos `number` vem `null`. **Sempre cheque** antes de usar:

```js
if (!c.number) continue;   // sem telefone, não dá para salvar/contatar
```

### Sobre `isSaved`

Vem da base "contatos já salvos" do painel (o que você marca com "Já salvei todos" / exporta com "vCard novos"). É um atalho conveniente para separar lead novo de contato conhecido.

**Mas você não é obrigado a depender dele.** Muitos sistemas preferem manter a própria noção de "já processei esse número" (uma tabela no seu banco). Aí você ignora o `isSaved` e usa `entrou`/`adicionado` de todos, deduplicando pelo número no seu lado. O CRM de exemplo faz assim — é mais robusto.

## O objeto Snapshot (membro)

Igual ao participante, mas representa o **estado atual** do grupo (não um evento). Vem de `/snapshots?groupId=...`.
