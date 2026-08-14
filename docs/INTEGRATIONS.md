# Integracoes - Meteorico CRM

## Visao geral

O sistema integra com servicos externos via interfaces definidas
(ports/adapters). Cada integracao tem uma interface TypeScript, uma
implementacao real e um mock para testes e desenvolvimento local.

## Status das integracoes

| Integracao               | Status       | Documentacao | Implementacao |
|--------------------------|-------------|--------------|---------------|
| WhatsApp Manager API     | Disponivel  | Kit incluso  | Etapa 04      |
| Meta WhatsApp Cloud API  | Disponivel  | Este documento | Etapa 11.2  |
| Eduzz                    | Futuro      | Pendente     | Etapa 07      |
| xAI/Grok                 | Futuro      | Pendente     | Etapa 07      |
| Meta Marketing API       | Futuro      | Pendente     | Etapa 07      |
| Historico de participacao| Parcial     | Contrato interno | Adapter pendente |

## 1. WhatsApp Manager API (somente leitura)

### Descricao

API do sistema WhatsApp Manager (repo rwadriel/whatsapp-manager) que
monitora grupos WhatsApp. O Meteorico CRM consome eventos desta API
para saber quando contatos entram ou saem de grupos.

### Relacao

- **Direcao**: Meteorico -> WhatsApp Manager (polling)
- **Tipo**: Somente leitura. O Meteorico nunca escreve no WhatsApp Manager.
- **Autenticacao**: API key via header

### Endpoints disponiveis

#### GET /api/integration/health

Verifica o contrato de leitura da integracao. O contrato atualmente publicado
pelo Group Manager nao inclui um sinal de sessao conectada; `connected` e
aceito de forma opcional para compatibilidade futura.

```
Response 200:
{
  "ok": true,
  "lastSeq": 3432,
  "events": 3432
}
```

#### GET /api/integration/events

Retorna eventos de grupo desde o cursor informado.

```
Query params:
  since: number - Ultimo sequence number consumido
  limit: number (opcional) - Limite de eventos (default no CRM: 2000)

Response 200:
{
  "events": [
    {
      "seq": 3432,
      "event_id": "evt_abc123",
      "ts": "2026-08-14T12:00:00Z",
      "event": "entrou",
      "groupId": "grp_123",
      "groupName": "Grupo",
      "participants": []
    }
  ],
  "nextSince": 3432,
  "hasMore": false,
  "lastSeq": 3432
}
```

Eventos incrementais de participacao confiaveis sao `entrou`, `adicionado`,
`saiu` e `removido`. `baseline`, `grupo_criado` e `alteracao` sao registrados
como ignorados e nao alteram participacao.

#### GET /api/integration/snapshots

Retorna o estado atual de todos os grupos monitorados.

```
Response 200:
{
  "groups": [
    {
      "groupId": "grp_123",
      "groupName": "Grupo Lancamento 01",
      "memberCount": 2,
      "updatedAt": "2026-08-14T12:00:00Z",
      "members": []
    }
  ]
}
```

### Kit de integracao

Documentacao e exemplos de integracao estao disponiveis em `kit/`.
O kit inclui:

- Tipos TypeScript para requests e responses
- Exemplos de chamadas
- Dados de mock para testes

### Padrao de consumo

```
Worker (polling loop):
  1. Ler cursor atual de integration_cursors
  2. GET /api/integration/health
  3. GET /api/integration/events?since={cursor}&limit=2000
  4. Registrar o poll bem-sucedido mesmo quando nao ha eventos
  5. Para cada evento:
     a. Verificar se ja foi processado (processed_events)
     b. Se novo: processar e registrar em processed_events
  6. Atualizar o cursor somente depois do processamento
  7. Se hasMore: repetir imediatamente
  8. Se nao hasMore: aguardar o intervalo (default 10s)
```

### Modelo de saude e seguranca de snapshot

O endpoint administrativo `GET /api/integration/health` separa a saude da
integracao da liveness do worker. Seus estados sao:

- `healthy`: poll e snapshot recentes e cursor no `lastSeq` do provedor.
- `degraded`: falha transitoria ou cursor realmente atras do `lastSeq`.
- `disconnected`: somente quando o provedor informa explicitamente
  `connected: false`.
- `stale`: poll ou snapshot ultrapassou o limite configurado.
- `error`: configuracao ausente ou falhas consecutivas.

Quando o provedor omite `connected`, o CRM mostra a origem como `inferred`
apenas se poll e snapshot estiverem recentes; caso contrario, a conexao fica
indeterminada. Um cursor antigo nao e considerado travado se `cursor` e
`providerLastSeq` continuam iguais, pois a ausencia de eventos e normal.

Snapshots com `updatedAt` invalido, implausivelmente no futuro ou mais antigos que
`GROUP_MANAGER_SNAPSHOT_STALE_AFTER_SECONDS` sao ignorados por inteiro. Eles
nao criam contato/participacao, nao marcam saida e nao atualizam a contagem do
grupo. A ausencia de `members` tambem e tratada como payload incompleto. Eventos
incrementais idempotentes continuam sendo consumidos normalmente.
Para o indicador global, o CRM usa o snapshot mais antigo entre os grupos que
ele conhece; um grupo atualizado nao mascara outro grupo obsoleto.
`providerSnapshotAt` guarda essa evidencia de origem e determina a idade.
`lastSuccessfulSnapshotAt` so avanca quando uma reconciliacao valida e recente
termina; erro ou snapshot stale nao o sobrescreve como se fosse sucesso.

O Group Manager atual nao oferece endpoint oficial de reconexao. O CRM nao
tenta controlar a sessao nem inventa um reconnect; a reconexao permanece na UI
oficial do proprio Manager.

### Tratamento de erros

- Falhas do provider sao persistidas como resumo sanitizado e contador
  consecutivo; credenciais e URLs nao sao expostas.
- O poll seguinte funciona como retry no intervalo configurado. Nao existe
  endpoint oficial de reconnect para acionar com backoff.
- Cada request ao Manager tem timeout de 10 segundos e ciclos sobrepostos sao
  ignorados, evitando acumulo de chamadas durante uma indisponibilidade.
- Dados invalidos sao isolados sem bloquear o worker.
- Logs estruturados usam `poll_success`, `snapshot_success`, `snapshot_stale`,
  `provider_error`, `reconciliation_skipped` e `integration_health_transition`.

## 2. Meta WhatsApp Cloud API

### Descricao

Provider oficial para receber mensagens e status e enviar mensagens privadas
por meio da Graph API. A integracao fica atras da interface
`MessagingProvider`; dominio e rotas nao chamam a Graph API diretamente.

### Status

**Disponivel** - O adapter `MetaCloudWhatsAppProvider` convive com o mock de
desenvolvimento. Ative-o somente com `WHATSAPP_PRIVATE_PROVIDER=meta_cloud`.

### Webhook

- Callback HTTPS: `GET/POST /webhooks/whatsapp/meta`
- O GET compara o verify token em tempo constante e devolve o challenge.
- O POST valida `X-Hub-Signature-256` sobre os bytes exatos do corpo antes do
  parse ou de qualquer escrita no banco.
- Apenas eventos `messages` da WABA e do Phone Number ID configurados sao
  aceitos.
- Mensagens inbound usam `externalMessageId` e `ProcessedEvent` para
  idempotencia. Os status suportados sao `sent`, `delivered`, `read` e
  `failed`.

### Inbound e classificacao

- O telefone e normalizado e o contato existente e reutilizado.
- A classificacao continua deterministica: `aluno`, `novo`, `reparticipante`,
  `veterano` ou `needs_review`.
- Inbound nao aloca grupos. `aluno` e `needs_review` permanecem fora de grupos
  comerciais.

### Outbound

O endpoint autenticado cria primeiro um `OutboundRecord`, enfileira em
`outbound-messages` (BullMQ), e o worker chama o provider. Opt-out e handoff
bloqueiam o envio. Em staging, API e worker aplicam a allowlist E.164; uma
tentativa fora dela vira registro `blocked` e nao chega a Graph API.

O webhook nunca dispara resposta direta. A resposta controlada deve passar
pelo mesmo caminho `OutboundRecord -> BullMQ -> worker -> provider`.

### Credencial operacional

Use um System User dedicado, associado somente a WABA correta, com
`whatsapp_business_messaging` e `whatsapp_business_management`.
`business_management` so deve ser adicionado se uma operacao realmente o
exigir. O token fica exclusivamente no secret manager do ambiente.

## 3. Eduzz (futuro)

### Descricao

Plataforma de vendas digitais. O sistema consultara a Eduzz para
confirmar compras e atualizar o status do contato para "aluno".

### Status

**Pendente** - Interface definida, implementacao mock.

### Interface planejada

```typescript
interface EduzzProvider {
  getInvoices(params: { since: Date, until: Date }): Promise<Invoice[]>
  getInvoiceByEmail(email: string): Promise<Invoice | null>
  getRefunds(params: { since: Date, until: Date }): Promise<Refund[]>
  verifyWebhookSignature(payload: string, signature: string): boolean
}
```

### Dados necessarios

- API key e secret do Eduzz
- IDs dos produtos monitorados
- Mapeamento produto -> campanha

### Entradas pendentes

- Contrato Eduzz com acesso a API
- Documentacao da API de faturas
- Mapeamento de produtos

## 4. xAI/Grok (futuro)

### Descricao

Provedor de IA para diagnostico personalizado de veteranos. Usado
apenas quando o contato e classificado como "veterano" (3+ campanhas
sem compra).

### Status

**Pendente** - Interface definida, implementacao mock.

### Interface planejada

```typescript
interface AIProvider {
  diagnose(input: DiagnosisInput): Promise<DiagnosisResult>
  healthCheck(): Promise<boolean>
}

interface DiagnosisInput {
  contactHistory: ContactHistory
  campaignContext: CampaignContext
  knowledgeBase: KnowledgeDocument[]
}

interface DiagnosisResult {
  diagnosis: string
  recommendations: string[]
  confidence: number
  tokensUsed: number
  latencyMs: number
}
```

### Consideracoes

- **Custo**: Cada diagnostico consome tokens. Monitorar custos.
- **Latencia**: Chamadas podem levar 2-5 segundos. Executar via worker.
- **Fallback**: Se o provedor estiver indisponivel, classificar como
  veterano sem diagnostico (graceful degradation).
- **Cache**: Diagnosticos podem ser cacheados por participacao.

### Entradas pendentes

- API key xAI
- Modelo a ser usado (Grok 2, etc)
- Prompt base para diagnostico
- Limites de uso/orcamento

## 5. Meta Marketing API (futuro)

### Descricao

API do Meta (Facebook/Instagram) para rastreamento de campanhas de
marketing e atribuicao de leads.

### Status

**Futuro** - Nenhuma interface definida ainda.

### Uso planejado

- Rastreamento de conversoes (lead capturado -> compra)
- Atribuicao de campanha de marketing ao lead
- Audiencias customizadas para remarketing

### Entradas pendentes

- Conta Business Manager verificada
- App registrado no Meta
- Pixel ID
- Permissoes necessarias

## 6. Historico externo de participacoes (parcial)

### Status

O contrato interno `ParticipationHistoryProvider` e a reconciliacao
idempotente estao preparados, mas nao existe adapter, endpoint externo,
URL, variavel de ambiente ou credencial definida. A integracao permanece
desativada ate o recebimento e a aprovacao do contrato do provedor.

### Regras de reconciliacao

- `CampaignParticipation` continua sendo a unica fonte definitiva de
  participacoes confirmadas.
- Edicoes identificaveis e ja existentes podem ser reconciliadas por
  `contactId + campaignId`, sem duplicacao.
- Edicoes desconhecidas nao criam campanhas automaticamente.
- Um total externo sem edicoes e preservado apenas em metadata como
  evidencia; ele nao fabrica `CampaignParticipation` nem altera o total
  confirmado.
- Evidencia repetida da mesma fonte substitui o registro anterior da
  fonte, em vez de somar contagens.
- Contato nao aluno sem participacao confirmada e com evidencia fica em
  `needs_review`, fora da alocacao automatica de grupos.

### Contrato esperado

```typescript
interface ParticipationHistoryProvider {
  readonly name: string
  getHistoryByPhones(phones: string[]): Promise<Array<{
    phone: string
    totalParticipations?: number
    campaignEditions?: number[]
  }>>
  healthCheck(): Promise<boolean>
}
```

### Entradas pendentes

- Documentacao e contrato do provedor externo
- URL base e metodo de autenticacao
- Credenciais de staging
- Politica de retry, rate limit e paginacao
- Autorizacao explicita para ativacao

## Padrao de integracao

### Ports & Adapters

Cada integracao segue o padrao ports & adapters:

```
packages/domain/
  ports/
    WhatsAppEventsPort.ts      # Interface (port)
    WhatsAppMessagingPort.ts
    SalesPort.ts
    AIPort.ts
    MarketingPort.ts

apps/api/
  adapters/
    WhatsAppManagerAdapter.ts  # Implementacao real
    EduzzAdapter.ts
    XAIAdapter.ts

packages/shared/
  mocks/
    MockWhatsAppEvents.ts      # Mock para testes
    MockWhatsAppMessaging.ts
    MockSales.ts
    MockAI.ts
```

### Principios

1. **Interface primeiro**: Definir a interface antes da implementacao
2. **Mock sempre disponivel**: Todo adapter tem um mock correspondente
3. **Configuravel**: Trocar entre real e mock via variavel de ambiente
4. **Logs**: Toda chamada externa e logada (com redacao de dados sensiveis)
5. **Circuit breaker**: Desativar integracao apos falhas consecutivas
6. **Idempotencia**: Processar o mesmo evento duas vezes nao causa duplicata
