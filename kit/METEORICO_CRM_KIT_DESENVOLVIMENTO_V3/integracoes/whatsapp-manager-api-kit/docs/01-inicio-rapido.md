# 1. Início rápido

## O que você precisa

- A **URL** do WhatsApp Manager: `https://zapgrupos-whatsapp-manager.gq2dju.easypanel.host`
- O **token** de integração (o valor de `WHATSAPP_MANAGER_INTEGRATION_TOKEN` que está no EasyPanel → Ambiente do whatsapp-manager)

## Primeiro request

Com `curl` (troque `SEU_TOKEN`):

```bash
curl -H "Authorization: Bearer SEU_TOKEN" \
  "https://zapgrupos-whatsapp-manager.gq2dju.easypanel.host/api/integration/health"
```

Resposta esperada:

```json
{ "ok": true, "lastSeq": 2722, "events": 2722 }
```

- `lastSeq` é o **cursor atual**: o número do último evento registrado.
- Sem o header, ou com token errado, você recebe `401 { "error": "nao autorizado" }`.

## A ideia central: cursor

O feed é uma **fila crescente** de eventos. Cada evento tem um número sequencial (`seq`). Você guarda o último `seq` que já processou (o **cursor**) e pergunta "o que houve depois disso?":

```
1. No primeiro boot, pegue o lastSeq atual (via /health) e salve como cursor.
   (assim você começa do presente, sem reprocessar o histórico todo)

2. A cada X segundos:
     GET /api/integration/events?since=<cursor>&limit=200
     → processa os eventos
     → salva o "nextSince" da resposta como novo cursor

3. Se seu sistema cair, ele recomeça do cursor salvo. Nada se perde.
```

## Ver entradas de verdade

```bash
curl -H "Authorization: Bearer SEU_TOKEN" \
  "https://zapgrupos-whatsapp-manager.gq2dju.easypanel.host/api/integration/events?since=0&only=entrou,adicionado&limit=3"
```

## Rodar o CRM de exemplo

O caminho mais rápido para ver tudo funcionando:

```bash
cd exemplos/crm
cp .env.example .env
# edite o .env: cole seu token em WM_TOKEN
node index.js       # começa a coletar os contatos que entram nos grupos
```

Em outro terminal:

```bash
node painel.js      # abre um painel em http://localhost:4080
```

Pronto — a partir daí é só evoluir o CRM do jeito que você quiser. Veja **[04-casos-de-uso.md](04-casos-de-uso.md)** para outras receitas.
