# 4. Casos de uso

Todos partem do mesmo motor: **seguir o feed com um cursor** (ver [01-inicio-rapido.md](01-inicio-rapido.md)). Muda só o que você faz com cada evento.

---

## CRM de leads (tem projeto pronto)

**Objetivo:** cada número que entra em qualquer grupo vira um contato na sua base, sem duplicar.

**Como:** siga `only=entrou,adicionado`. Para cada participante com `number`, faça um "upsert" (insere se novo, ignora se já existe) numa tabela sua. Guarde o primeiro grupo e a data de entrada.

Está tudo implementado em **[../exemplos/crm/](../exemplos/crm/)** — base SQLite, dedup por número, cursor persistido e um painel web para ver/exportar. É o ponto de partida do seu projeto.

```
node index.js    # coleta
node painel.js   # visualiza em http://localhost:4080
```

Ideias de evolução do CRM:
- Campos extras: DDD, região, quantos grupos a pessoa está.
- Tags automáticas (por grupo de origem, por horário).
- Exportar filtrado (só de um grupo, só de um período).
- Cruzar com suas outras bases (Eduzz, Nutror).

---

## Boas-vindas a contatos novos

**Objetivo:** quando alguém entra e ainda não é seu contato, reagir (mensagem, e-mail, o que for).

**Como:** siga `only=entrou,adicionado&onlyUnsaved=true`. O feed já entrega só os não salvos.

```js
for (const ev of r.events) {
  for (const c of ev.participants) {
    if (c.isSaved || !c.number) continue;
    if (jaProcessado(ev.event_id)) continue;
    await suaAcaoDeBoasVindas(c.number, c.name, ev.groupName);
    marcarProcessado(ev.event_id);
  }
}
```

> Se a ação for **enviar mensagem no WhatsApp**, faça com atraso aleatório e limite por hora — envio em massa é o que arrisca bloqueio da conta. Comece o cursor no `lastSeq` atual para não disparar retroativo para quem já estava nos grupos.

---

## Recuperação de quem saiu

**Objetivo:** agir sobre quem saiu ou foi removido (campanha de retorno, marcar no CRM como "saiu").

**Como:** siga `only=saiu,removido`. O `author` diz quem removeu (vazio = saiu sozinho). O `number` e o `name` de quem saiu vêm preservados do momento em que a pessoa ainda estava ativa.

```js
const r = await api(`/api/integration/events?since=${cursor}&only=saiu,removido&limit=200`);
for (const ev of r.events) {
  for (const c of ev.participants) {
    if (!c.number) continue;
    marcarComoSaiu(c.number, ev.groupName, ev.ts, ev.author);
  }
}
```

---

## Analytics de crescimento

**Objetivo:** medir entradas e saídas por grupo, por dia.

**Como:** siga o feed inteiro (sem `only`), e agregue por `groupName` + dia (`ts`). Guarde contadores. Com isso você monta gráficos de crescimento, taxa de saída, horários de pico de entrada.

```js
for (const ev of r.events) {
  const dia = ev.ts.slice(0, 10);            // YYYY-MM-DD
  const delta = /entrou|adicionado/.test(ev.event) ? +1 : /saiu|removido/.test(ev.event) ? -1 : 0;
  acumular(ev.groupName, dia, delta, ev.participants.length);
}
```

---

## Espelhar a lista de um grupo

**Objetivo:** ter a lista completa e atual de membros de um grupo específico.

**Como:** `GET /api/integration/snapshots?groupId=<id>`. Retorna todos os membros com `isSaved`. Descubra o `groupId` pelo índice (`/snapshots` sem parâmetro).

```js
const idx = await api("/api/integration/snapshots");
const grupo = idx.groups.find((g) => g.groupName.includes("IA 41"));
const full = await api(`/api/integration/snapshots?groupId=${grupo.groupId}`);
console.log(full.groups[0].members.length, "membros");
```

---

## Combinações

Nada impede rodar vários ao mesmo tempo, cada um com **seu próprio cursor**: um processo para o CRM, outro para boas-vindas, outro para analytics. Como é pull, eles não interferem entre si.
