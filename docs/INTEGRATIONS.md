# Integracoes - Meteorico CRM

## Visao geral

O sistema integra com servicos externos via interfaces definidas
(ports/adapters). Cada integracao tem uma interface TypeScript, uma
implementacao real e um mock para testes e desenvolvimento local.

## Status das integracoes

| Integracao               | Status       | Documentacao | Implementacao |
|--------------------------|-------------|--------------|---------------|
| WhatsApp Manager API     | Disponivel  | Kit incluso  | Etapa 04      |
| WhatsApp Messaging       | Futuro      | Pendente     | Etapa 06      |
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

#### GET /health

Verifica se o servico esta disponivel.

```
Response 200:
{
  "status": "ok",
  "uptime": 123456,
  "version": "1.0.0"
}
```

#### GET /events

Retorna eventos de grupo desde o cursor informado.

```
Query params:
  cursor: string (opcional) - Cursor para paginacao
  limit: number (opcional) - Limite de eventos (default: 100)

Response 200:
{
  "events": [
    {
      "id": "evt_abc123",
      "type": "group_join",
      "group_id": "grp_123",
      "phone": "5511999999999",
      "timestamp": "2024-01-01T12:00:00Z",
      "metadata": {}
    }
  ],
  "next_cursor": "cursor_xyz",
  "has_more": true
}
```

Tipos de evento:
- `group_join` - Contato entrou no grupo
- `group_leave` - Contato saiu do grupo
- `group_removed` - Contato foi removido do grupo

#### GET /snapshots

Retorna o estado atual de todos os grupos monitorados.

```
Response 200:
{
  "groups": [
    {
      "id": "grp_123",
      "name": "Grupo Lancamento 01",
      "members": ["5511999999999", "5511888888888"],
      "member_count": 2,
      "snapshot_at": "2024-01-01T12:00:00Z"
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
  2. GET /events?cursor={cursor}&limit=100
  3. Para cada evento:
     a. Verificar se ja foi processado (processed_events)
     b. Se novo: processar e registrar em processed_events
  4. Atualizar cursor em integration_cursors
  5. Se has_more: repetir imediatamente
  6. Se nao has_more: aguardar intervalo (configuravel, default 30s)
```

### Tratamento de erros

- **Timeout**: 10 segundos. Retry com backoff exponencial.
- **429 Rate Limit**: Respeitar Retry-After header.
- **5xx**: Retry com backoff. Alerta apos 5 falhas consecutivas.
- **Dados invalidos**: Registrar evento com erro, nao bloquear fila.

## 2. WhatsApp Messaging Provider (futuro)

### Descricao

Provedor de envio de mensagens WhatsApp. Sera usado para enviar
mensagens aos contatos durante fluxos de conversa.

### Status

**Pendente** - O provedor ainda nao foi definido. A integracao sera
implementada via interface + mock ate que o provedor seja escolhido.

### Interface planejada

```typescript
interface WhatsAppMessagingProvider {
  sendTextMessage(phone: string, text: string): Promise<MessageResult>
  sendTemplateMessage(phone: string, template: string, params: Record<string, string>): Promise<MessageResult>
  sendButtonMessage(phone: string, text: string, buttons: Button[]): Promise<MessageResult>
  getMessageStatus(messageId: string): Promise<MessageStatus>
}
```

### Entradas pendentes

- Escolha do provedor (API oficial WhatsApp Business, 360dialog, etc)
- Credenciais e limites
- Aprovacao de templates

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
