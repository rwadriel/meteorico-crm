# 5. Boas práticas

Cinco regras que evitam as dores de cabeça mais comuns.

## 1. Comece do presente no primeiro boot

Se você começar com `cursor = 0`, vai processar **todo o histórico** (milhares de eventos) de uma vez. Na primeira execução, pegue o cursor atual e comece dali:

```js
let cursor = carregarCursor();
if (cursor == null) {
  cursor = (await api("/api/integration/health")).lastSeq;   // começa do agora
  salvarCursor(cursor);
}
```

Exceção: se o seu objetivo é justamente montar a base histórica (ex.: o CRM importando todos os leads que já entraram), aí `cursor = 0` é o que você quer — mas pagine até `hasMore: false`.

## 2. Deduplique pelo `event_id`

O feed é confiável, mas seu sistema pode reprocessar (reinício no meio de uma página, bug, reentrega). Guarde os `event_id` já processados e ignore repetidos:

```js
if (jaProcessado(ev.event_id)) continue;
// ... age ...
marcarProcessado(ev.event_id);
```

Para CRM, uma alternativa ainda mais simples: deduplique pelo **número** (upsert). Se o contato já existe, não faz nada.

## 3. Persista o cursor DEPOIS de processar

Salve o cursor só **após** ter processado (e persistido) os eventos da página. Assim, se cair no meio, você reprocessa a página (e a dedup do item 2 cuida do resto) em vez de pular eventos.

```js
for (const ev of r.events) { processa(ev); }   // primeiro processa
cursor = r.nextSince;                            // depois avança
salvarCursor(cursor);
```

## 4. Sempre cheque `number` nulo

Membros identificados só por LID vêm com `number: null`. Não dá para salvar nem contatar:

```js
if (!c.number) continue;
```

## 5. Intervalo de polling e paginação

- **Intervalo:** 5 a 15 segundos é ótimo para qualquer caso aqui. Não precisa ser mais rápido.
- **Paginação:** se `hasMore: true`, continue chamando com `since = nextSince` **antes** de dormir o intervalo, até esvaziar. Assim você não fica para trás quando há um pico de eventos.

```js
let sync = true;
while (sync) {
  const r = await api(`/api/integration/events?since=${cursor}&limit=2000`);
  for (const ev of r.events) processa(ev);
  cursor = r.nextSince;
  salvarCursor(cursor);
  sync = r.hasMore;   // continua imediatamente se ainda há mais
}
```

## Segurança

- **Token = senha.** Ele dá acesso aos contatos dos seus grupos. Guarde em variável de ambiente, nunca no código nem em repositório público.
- **Só header.** Nunca `?token=...` na URL.
- **HTTPS sempre** (o EasyPanel já entrega).
- Se o token vazar, gere outro no EasyPanel (Ambiente → troque `WHATSAPP_MANAGER_INTEGRATION_TOKEN` → Implantar).

## Sobre o WhatsApp Manager ser a "ponta frágil"

A API é `pull` de propósito: o WhatsApp Manager depende da biblioteca `whatsapp-web.js`, que às vezes quebra quando o WhatsApp muda por dentro (já aconteceu). Quando isso ocorre, ele para de gerar **eventos novos** por um tempo, mas **não perde** o que já registrou — e o feed continua servindo o histórico. Seu sistema, seguindo o cursor, simplesmente não vê eventos novos até o WhatsApp Manager voltar, e retoma sozinho. Você não precisa fazer nada especial: o design já é tolerante a isso.
