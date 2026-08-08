# Arquitetura do Meteorico CRM

## Visao geral

O sistema e organizado como um monorepo TypeScript com pnpm workspaces,
dividido em aplicacoes (apps) e pacotes compartilhados (packages).

```
meteorico-crm/
├── apps/
│   ├── web/          # Frontend React + Vite
│   ├── api/          # Servidor Fastify (HTTP + WebSocket)
│   └── worker/       # Processamento assincrono (BullMQ)
├── packages/
│   ├── domain/       # Logica de negocio pura (sem I/O)
│   ├── database/     # Prisma schema, migrations, client
│   ├── shared/       # Tipos, constantes, utilitarios compartilhados
│   └── ui/           # Componentes React compartilhados
├── docs/             # Documentacao do projeto
├── docker/           # Dockerfiles e docker-compose
└── scripts/          # Scripts de automacao
```

## Aplicacoes

### apps/web

Interface administrativa construida com React e Vite.

- **Responsabilidades**: Dashboard, gestao de campanhas, visualizacao de
  contatos, configuracao de fluxos, relatorios
- **Comunicacao**: Consome a API via HTTP (REST) e WebSocket (eventos em
  tempo real)
- **Autenticacao**: Cookie httpOnly com sessao gerenciada pelo servidor

### apps/api

Servidor HTTP construido com Fastify.

- **Responsabilidades**: Endpoints REST, autenticacao, autorizacao,
  validacao de entrada, WebSocket para eventos em tempo real
- **Padrao**: Controller -> Service -> Repository
- **Validacao**: Zod schemas para request/response
- **Logs**: Pino (estruturado, JSON)
- **Plugins Fastify**: CORS, helmet, rate-limit, cookie, session

### apps/worker

Processo dedicado para tarefas assincronas via BullMQ.

- **Responsabilidades**: Polling de eventos do WhatsApp Manager,
  classificacao de leads, envio de mensagens, sincronizacao com
  integracao Eduzz, diagnostico IA
- **Filas**: Cada tipo de tarefa tem sua propria fila
- **Concorrencia**: Configuravel por fila
- **Retry**: Backoff exponencial com dead-letter queue

## Pacotes compartilhados

### packages/domain

Logica de negocio pura, sem dependencias de infraestrutura.

- **Conteudo**: Entidades, value objects, regras de classificacao,
  maquinas de estado, validacoes de negocio
- **Principio**: Nenhuma dependencia de I/O (sem banco, sem HTTP, sem
  filesystem). Testavel com Vitest puro.
- **Exporta**: Funcoes puras, tipos, constantes de dominio

### packages/database

Camada de persistencia com Prisma.

- **Conteudo**: Schema Prisma, migrations, seed, client configurado
- **Exporta**: PrismaClient tipado, helpers de conexao

### packages/shared

Utilitarios e tipos usados por multiplas aplicacoes.

- **Conteudo**: Tipos TypeScript compartilhados, constantes,
  funcoes utilitarias, schemas Zod reutilizaveis
- **Principio**: Sem dependencias de runtime pesadas

### packages/ui

Componentes React compartilhados (futuro - design system).

- **Conteudo**: Componentes base, tokens de design, hooks compartilhados

## Fluxo de dados

### Captura de lead (fluxo principal)

```
WhatsApp Manager API                  Meteorico CRM
      │                                    │
      │  GET /events (polling)             │
      │<───────────────────────────────────│ worker
      │                                    │
      │  { type: "group_join", ... }       │
      │────────────────────────────────────>│
      │                                    │
      │                              ┌─────┴─────┐
      │                              │  Processar │
      │                              │   evento   │
      │                              └─────┬─────┘
      │                                    │
      │                              ┌─────┴─────┐
      │                              │  Upsert    │
      │                              │  contato   │
      │                              └─────┬─────┘
      │                                    │
      │                              ┌─────┴──────┐
      │                              │ Classificar│
      │                              │    lead    │
      │                              └─────┬──────┘
      │                                    │
      │                              ┌─────┴─────┐
      │                              │  Criar     │
      │                              │participacao│
      │                              └─────┬─────┘
      │                                    │
      │                              ┌─────┴─────┐
      │                              │  Atribuir  │
      │                              │   grupo    │
      │                              └────────────┘
```

### Classificacao de lead

```
                    ┌──────────────┐
                    │  Contato     │
                    │  encontrado  │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │ Tem compra?  │
                    └──────┬───────┘
                      sim/ │ \nao
                     /     │  \
              ┌─────┐     │   ┌──────────────┐
              │ALUNO│     │   │Participacoes │
              └─────┘     │   │ anteriores?  │
                          │   └──────┬───────┘
                          │    nao/  │  \sim
                          │   /     │   \
                          │ ┌────┐  │  ┌────────────┐
                          │ │NOVO│  │  │ 3 ou mais? │
                          │ └────┘  │  └─────┬──────┘
                          │         │  nao/  │  \sim
                          │         │  /     │   \
                          │    ┌──────────┐ ┌─────────┐
                          │    │RECORRENTE│ │VETERANO │
                          │    └──────────┘ │(+ diag.)│
                          │                 └─────────┘
```

## Comunicacao entre componentes

### API <-> Worker

Comunicacao indireta via Redis (BullMQ):

- API enfileira tarefas no Redis
- Worker consome filas e processa
- Resultados sao gravados no PostgreSQL
- API pode ser notificada via pub/sub Redis para WebSocket

### API <-> Web

- **REST**: Operacoes CRUD, consultas, acoes
- **WebSocket**: Eventos em tempo real (novo lead, mudanca de grupo,
  atualizacao de campanha)

### Worker <-> WhatsApp Manager

- **Polling**: Worker faz GET periodico em /events com cursor
- **Somente leitura**: Nenhuma escrita no WhatsApp Manager
- **Idempotencia**: Eventos processados sao registrados para evitar
  reprocessamento

## Infraestrutura

### PostgreSQL

Banco de dados principal. Armazena todos os dados persistentes.

- Contatos, campanhas, participacoes, grupos
- Eventos imutaveis (group_events, processed_events)
- Configuracoes, templates, fluxos
- Audit logs

### Redis

Cache e mensageria.

- **BullMQ**: Filas de tarefas assincronas
- **Cache**: Sessoes de usuario, dados frequentes
- **Pub/Sub**: Notificacoes em tempo real para WebSocket
- **Rate limiting**: Contadores de requisicoes

### Filas BullMQ (implementadas)

| Fila                    | Descricao                              | Retry | Concorrencia | Rate Limit |
|-------------------------|----------------------------------------|-------|--------------|------------|
| outbound-messages       | Envio de mensagens WhatsApp            | 5x exponencial (2s base) | 5 | 30/s |
| integration-tasks       | Tarefas de integracao (Eduzz, sync)    | 8x exponencial (3s base) | 3 | 10/s |

Ambas as filas usam:
- **Idempotencia**: jobId unico por tarefa (via ProcessedEvent ou dedup interno)
- **Dead-letter**: apos esgotar retries, job vai para dead-letter automatico do BullMQ
- **Observabilidade**: GET /api/queues/status (requer permissao settings:read)

### Filas BullMQ (planejadas)

| Fila                    | Descricao                              | Prioridade |
|-------------------------|----------------------------------------|------------|
| whatsapp-events         | Polling e processamento de eventos     | Alta       |
| lead-classification     | Classificacao de novos leads           | Alta       |
| ai-diagnosis            | Diagnostico IA para veteranos          | Baixa      |
| import-processing       | Processamento de importacoes em massa  | Baixa      |

### Rotas da API

| Rota                         | Metodo | Permissao          | Descricao                        |
|------------------------------|--------|---------------------|----------------------------------|
| /api/auth/*                  | POST   | publica             | Login, logout, refresh           |
| /api/campaigns/*             | CRUD   | campaigns:*         | Gestao de campanhas              |
| /api/groups/*                | CRUD   | groups:*            | Gestao de grupos                 |
| /api/contacts/*              | GET/PUT| contacts:read/update| Lista, detalhe, update contatos  |
| /api/contacts/stats          | GET    | contacts:read       | Estatisticas de contatos         |
| /api/imports/*               | CRUD   | campaigns:create    | Importacao CSV                   |
| /api/flows/*                 | CRUD   | flows:*             | Gestao de fluxos                 |
| /api/templates/*             | CRUD   | messages:*          | Templates de mensagem            |
| /api/messages/*              | CRUD   | messages:*          | Mensagens e conversas            |
| /api/diagnosis/*             | POST   | messages:create     | Diagnostico IA                   |
| /api/knowledge-base/*        | CRUD   | settings:*          | Base de conhecimento IA          |
| /api/dashboards/*            | GET    | reports:read        | Dashboards e metricas            |
| /api/audit-logs              | GET    | audit:read          | Logs de auditoria                |
| /api/settings/*              | CRUD   | settings:*          | Configuracoes do sistema         |
| /api/queues/status           | GET    | settings:read       | Status das filas BullMQ          |
| /api/integrations/*          | CRUD   | settings:*          | Configuracao de integracoes      |
| /webhook/eduzz               | POST   | HMAC-SHA256         | Webhook Eduzz (purchase/refund)  |
| /health                      | GET    | publica             | Health check                     |
| /docs (Swagger)              | GET    | desabilitado prod   | Documentacao da API              |

## Decisoes arquiteturais chave

### 1. Monorepo com pacotes de dominio puro

A logica de negocio vive em `packages/domain` sem dependencias de I/O.
Isso permite testes rapidos e reutilizacao entre API e Worker.

### 2. Eventos imutaveis + projecoes mutaveis

Eventos do WhatsApp (entradas, saidas) sao armazenados de forma imutavel.
O estado atual (membros de um grupo, status de um contato) e derivado
desses eventos. Isso garante rastreabilidade e permite reconstruir estado.

### 3. Worker separado

O processamento assincrono roda em processo dedicado, nao dentro da API.
Isso isola falhas, permite escalar independentemente e evita que tarefas
pesadas bloqueiem requisicoes HTTP.

### 4. Polling ao inves de webhook

O WhatsApp Manager API e consultado via polling (GET /events com cursor),
nao via webhook. Isso simplifica a infraestrutura (sem necessidade de
endpoint publico no Worker) e garante controle sobre o ritmo de consumo.

### 5. Classificacao deterministica

A classificacao de leads e deterministica (baseada em regras) para 3 das
4 categorias. IA e usada apenas para o diagnostico de veteranos, onde a
personalizacao justifica o custo e a latencia.
