# ADR-0002: Modelo orientado a eventos com contato global

## Status

Aceita

## Data

2026-08-07

## Contexto

O Meteorico CRM precisa rastrear a participacao de contatos em
campanhas semanais de lancamento. O mesmo contato pode participar de
multiplas campanhas ao longo do tempo, e a classificacao do lead
(novo, recorrente, veterano, aluno) depende do historico completo.

### Problemas a resolver

1. **Identidade do contato**: Um numero de telefone pode aparecer em
   multiplas campanhas. Precisamos de uma unica fonte de verdade.

2. **Historico completo**: A classificacao de um lead depende de
   quantas campanhas ele participou e se ja comprou. Isso requer
   acesso ao historico global, nao apenas da campanha atual.

3. **Rastreabilidade**: Precisamos saber exatamente quando e como
   cada contato entrou e saiu de cada grupo, para auditoria e
   depuracao.

4. **Consistencia**: Eventos do WhatsApp Manager podem chegar fora
   de ordem ou duplicados. O modelo precisa lidar com isso.

## Decisao

Adotar um modelo com tres pilares:

### 1. Contato global

Um unico registro por numero de telefone, independente de campanha.

```
contacts
  id: UUID
  phone: "+5511999999999" (unico)
  total_participations: 5
  total_purchases: 1
  is_student: true
```

O contato agrega informacoes de todas as campanhas. Contadores como
`total_participations` e `total_purchases` sao projecoes - valores
derivados que podem ser recalculados a partir dos registros detalhados.

### 2. Participacao por campanha

A relacao entre contato e campanha e explicita e carrega a classificacao.

```
campaign_participations
  contact_id: UUID -> contacts
  campaign_id: UUID -> campaigns
  classification: "returning"  (calculada no momento da criacao)
  status: "active"
```

A classificacao e determinada no momento em que a participacao e criada,
usando o historico global do contato:

```
se contato.is_student          -> "student"
se contato.total_participations == 0 -> "new"
se contato.total_participations >= 3 -> "veteran"
senao                          -> "returning"
```

### 3. Eventos imutaveis

Todos os eventos de grupo (entradas, saidas) sao armazenados de forma
imutavel. O estado atual e derivado desses eventos.

```
group_events (IMUTAVEL - append only)
  id: UUID
  group_id: UUID
  contact_id: UUID
  event_type: "join" | "leave" | "removed"
  whatsapp_event_id: "evt_abc123" (unico - idempotencia)
  occurred_at: timestamp
  raw_payload: jsonb

group_memberships (PROJECAO - derivada de group_events)
  group_id: UUID
  contact_id: UUID
  is_active: true/false
  joined_at: timestamp
  left_at: timestamp | null
```

## Consequencias

### Positivas

- **Classificacao precisa**: Como o contato e global, a classificacao
  sempre considera o historico completo, mesmo que o contato tenha
  participado de campanhas gerenciadas por diferentes operadores.

- **Rastreabilidade total**: Eventos imutaveis permitem reconstruir
  o estado de qualquer grupo em qualquer ponto no tempo. Util para
  auditoria, depuracao e resolucao de disputas.

- **Idempotencia natural**: O campo `whatsapp_event_id` com constraint
  unico garante que o mesmo evento nunca e processado duas vezes,
  mesmo que o WhatsApp Manager o entregue em duplicata.

- **Resiliencia a falhas**: Se as projecoes ficarem inconsistentes
  (por um bug, por exemplo), podem ser reconstruidas a partir dos
  eventos imutaveis. Os eventos sao a fonte de verdade.

- **Evolucao segura**: Novas projecoes podem ser adicionadas no futuro
  sem alterar os eventos existentes. Por exemplo, adicionar uma
  projecao de "tempo medio de permanencia em grupo".

### Negativas

- **Mais armazenamento**: Eventos imutaveis crescem indefinidamente.
  Para o volume esperado (centenas de eventos por semana), isso nao
  e um problema pratico.

- **Consultas mais complexas**: Derivar o estado atual de um grupo
  requer agregar eventos ou consultar a projecao. A projecao
  (`group_memberships`) resolve isso para consultas frequentes.

- **Consistencia eventual**: Ha uma janela entre o evento ser
  registrado e a projecao ser atualizada. Na pratica, isso ocorre
  na mesma transacao, entao a janela e minima.

- **Contadores podem dessincronizar**: `contacts.total_participations`
  e uma projecao que pode ficar desatualizada. Mitigacao: job
  periodico de reconciliacao.

### Neutras

- **Nao e Event Sourcing completo**: O sistema nao reconstroi todo o
  estado a partir de eventos. Apenas os dados de grupo usam este
  padrao. O restante do sistema (campanhas, configuracoes, etc) usa
  CRUD tradicional. Isso e intencional - Event Sourcing completo
  adicionaria complexidade sem beneficio proporcional.

## Como o estado atual e derivado

### Exemplo: membros ativos de um grupo

```sql
-- Opcao 1: Via projecao (rapido, usado em consultas normais)
SELECT * FROM group_memberships
WHERE group_id = ? AND is_active = true;

-- Opcao 2: Via eventos (lento, usado para auditoria/reconciliacao)
SELECT DISTINCT ON (contact_id)
  contact_id,
  event_type,
  occurred_at
FROM group_events
WHERE group_id = ?
ORDER BY contact_id, occurred_at DESC;
-- Filtrar onde event_type = 'join'
```

### Exemplo: classificacao de um novo lead

```
1. Evento: group_join para phone +5511999999999

2. Buscar contato:
   SELECT * FROM contacts WHERE phone = '+5511999999999'

3a. Se contato nao existe:
    - Criar contato (total_participations = 0, is_student = false)
    - Classificar como "new"

3b. Se contato existe:
    - Verificar is_student -> se sim: "student"
    - Verificar total_participations:
      - 0: "new" (nao deveria acontecer se contato ja existe)
      - 1-2: "returning"
      - 3+: "veteran" (agendar diagnostico IA)

4. Criar campaign_participation com a classificacao

5. Atribuir grupo baseado na classificacao e capacidade

6. Atualizar contato: total_participations += 1
```

## Alternativas consideradas

### 1. Contato por campanha (sem contato global)

Cada campanha teria seus proprios contatos, vinculados por telefone.

- **Pro**: Modelo mais simples, sem necessidade de cross-reference
- **Contra**: Classificacao de "recorrente" e "veterano" requer
  consulta cross-campanha de qualquer forma. Duplicacao de dados.
  Historico fragmentado.
- **Motivo da rejeicao**: Nao atende ao requisito de classificacao
  baseada em historico completo.

### 2. CRUD puro (sem eventos imutaveis)

Apenas manter `group_memberships` mutavel, sem `group_events`.

- **Pro**: Modelo mais simples, menos tabelas
- **Contra**: Sem rastreabilidade. Se algo der errado, nao ha como
  saber o que aconteceu. Sem protecao contra reprocessamento de
  eventos duplicados.
- **Motivo da rejeicao**: Rastreabilidade e idempotencia sao
  requisitos fundamentais para um sistema que depende de eventos
  externos (WhatsApp Manager).

### 3. Event Sourcing completo

Todo o estado do sistema derivado de eventos imutaveis.

- **Pro**: Rastreabilidade total, replay, temporal queries
- **Contra**: Complexidade significativa. Requer event store, projecoes
  para cada consulta, rebuild de estado. Overhead desproporcional
  para um CRM de lancamento semanal.
- **Motivo da rejeicao**: Over-engineering. O padrao de eventos
  imutaveis e aplicado onde faz sentido (grupo events), enquanto o
  restante usa CRUD que e mais simples e adequado.

## Referencias

- Martin Fowler - Event Sourcing: https://martinfowler.com/eaaDev/EventSourcing.html
- Greg Young - CQRS and Event Sourcing
- Vaughn Vernon - Domain-Driven Design Distilled
