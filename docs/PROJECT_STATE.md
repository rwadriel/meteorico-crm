# Estado do Projeto - Meteorico CRM

Ultima atualizacao: 2026-08-08

## Etapa atual

**Etapa 06 - Conversa privada, redirecionador e atribuicao** (CONCLUIDA)

## O que esta pronto

### Etapa 01 - Fundacao
- [x] Estrutura do monorepo (pnpm workspaces)
- [x] Configuracao de TypeScript (tsconfig base + composite)
- [x] Configuracao de linting (ESLint 9 flat config)
- [x] Configuracao de formatacao (Prettier)
- [x] packages/shared, domain, database, ui
- [x] apps/api, worker, web
- [x] Docker Compose, Dockerfiles, CI

### Etapa 02 - Banco e Seguranca
- [x] Schema Prisma completo (30+ tabelas)
- [x] Migration inicial aplicada
- [x] Autenticacao com Argon2id (OWASP params)
- [x] Sessoes httpOnly/Secure/SameSite com rotacao
- [x] RBAC: owner, admin, operator, analyst, read_only
- [x] 67 permissoes granulares por recurso/acao
- [x] Middleware requireAuth e requirePermission
- [x] Rate limiting global (100/min) e por rota de auth (5/15min)
- [x] Audit logging (login, logout, falhas)
- [x] Seed com dados ficticios e admin por variavel de ambiente
- [x] Constraints: unique phone, unique participation, unique event_id, unique slug
- [x] Cascade deletes em sessoes
- [x] Testes de integracao com PostgreSQL real

### Etapa 03 - Design System e Painel Admin
- [x] Design system CSS completo (dark theme, lime-green #84cc16 accents)
- [x] Design tokens (cores, tipografia, espacamento, sombras, z-index)
- [x] Componentes UI: Button, Input, Modal, Table, Badge, Skeleton, EmptyState, ConfirmDialog, Alert
- [x] AuthContext com login/logout via cookie
- [x] Hooks usePermission e useCanAccess (RBAC frontend)
- [x] ProtectedRoute com redirect para login
- [x] AdminLayout com sidebar, topbar, breadcrumbs
- [x] Sidebar com navegacao por secao e controle de permissao
- [x] Pagina de Login completa com tratamento de erro
- [x] Dashboard com cards de estatisticas
- [x] Router com rotas protegidas e redirect
- [x] Responsivo (mobile sidebar overlay, breakpoints 1024px e 640px)
- [x] Acessibilidade: focus-visible, aria-labels, role attributes, prefers-reduced-motion
- [x] Testes de componentes (16 testes web)

### Etapa 04 - Campanhas, Grupos, Versoes e Importacao
- [x] Schema migration: editionNumber em Campaign, inviteLink e priority em Group
- [x] Zod schemas: campaign, group, import (validacao completa)
- [x] Campaign CRUD: create, read, update, delete, list com filtros e busca
- [x] Campaign lifecycle: activate (valida draft/groups/dates/no-other-active), complete, archive
- [x] Campaign duplication: copia grupos, +7 dias, incrementa editionNumber
- [x] Campaign versions: publish e list
- [x] Group CRUD: create com 5 categorias (novo/reparticipante/veterano/aluno/geral), update, delete
- [x] CSV import: parser manual (sem dependencia), sanitizacao de formula injection
- [x] Phone normalization: BR numbers, +55 prefix, validacao 12-13 digitos
- [x] Import preview: parse, validacao, criacao de ImportRow records
- [x] Import confirm (contacts): upsert por phone, student prevails, merge metadata
- [x] Import confirm (participations): cria contatos, campanhas historicas (sem datas inventadas), participacoes
- [x] Import rollback: desfaz creates, mantem updates
- [x] rotulos_vcard vai para metadata de participacao, nunca vira nome de contato
- [x] Importacao idempotente (reimport nao duplica)
- [x] Path traversal check em filenames
- [x] Multipart file upload via @fastify/multipart
- [x] Audit logging em todas as operacoes
- [x] Frontend: CampaignsPage (list/filter/search/create/duplicate/activate/complete/archive/delete)
- [x] Frontend: GroupsPage (list por campanha/create/edit/delete com 5 categorias)
- [x] Frontend: ImportsPage (wizard upload/preview/confirm, historico, rollback)
- [x] Testes unitarios: normalizePhone, parseContactsCsv, parseParticipationsCsv, sanitizeString
- [x] Testes integracao: campaigns CRUD e lifecycle (16 testes)
- [x] Testes integracao: groups CRUD (7 testes)
- [x] Testes integracao: imports preview/confirm/rollback/student-prevails/idempotent/historical/vcard/path-traversal (12 testes)

### Etapa 05 - Consumidor da API de Grupos e Reconciliacao
- [x] WhatsAppManagerReadProvider: adapter read-only com health, events (cursor+paginacao), snapshots
- [x] Contrato de interfaces: WmEvent, WmParticipant, WmEventsResponse, WmHealthResponse, WmSnapshotGroup
- [x] createProvider() le env vars (WHATSAPP_MANAGER_URL, WHATSAPP_MANAGER_INTEGRATION_TOKEN)
- [x] Event processor transacional: entrada (entrou/adicionado), saida (saiu/removido)
- [x] Idempotencia por event_id via ProcessedEvent model
- [x] Mapeamento groupId (whatsappId) para Group e Campaign
- [x] Upsert de contato por phone (skip null numbers)
- [x] GroupMembership: create/deactivate com currentCount atualizado
- [x] CampaignParticipation: uma por contato/campanha, reativacao em reentrada
- [x] totalParticipations incrementado apenas na primeira participacao por campanha
- [x] Dead-letter queue: eventos com falha ou grupo desconhecido marcados em ProcessedEvent
- [x] Grupo orfao: whatsappId desconhecido cria grupo inativo em campanha _orphan-events
- [x] Eventos nao-membership (baseline, grupo_criado, alteracao) marcados como skipped
- [x] Multi-participant: whatsappEventId com sufixo :N para unicidade
- [x] Snapshot reconciliation: compara membros do snapshot com memberships ativas
- [x] Worker polling loop com intervalo configuravel (WORKER_POLLING_INTERVAL_MS, default 10s)
- [x] Paginacao completa: drena hasMore antes de dormir
- [x] Cursor persistido via IntegrationCursor model (upsert apos cada pagina)
- [x] Reconciliacao periodica configuravel (WORKER_RECONCILIATION_INTERVAL_MS, default 1h)
- [x] Shutdown gracioso (SIGTERM/SIGINT) com disconnect
- [x] API integration health: GET /api/integration/health (cursor, totais, erros recentes)
- [x] API orphan groups: GET /api/integration/orphan-groups, POST assign
- [x] Permissoes RBAC: integration read/write para owner e admin
- [x] Frontend IntegrationsPage: dashboard com status, cursor, contadores, erros, grupos orfaos
- [x] Auto-refresh a cada 30s no dashboard
- [x] Testes adapter: 9 testes (endpoints, auth, erros HTTP, defaults)
- [x] Testes event processor: 12 testes (entry, exit, re-entry, idempotency, multi-participant, null number, unknown group, skip non-membership, batch, adicionado/removido, contact name update)
- [x] Testes integracao API: 6 testes (health empty, health with data, dead-letter errors, orphan groups, assign orphan, auth)
- [x] Pino logger com redact de token, password, secret, phone, authorization
- [x] Nenhum dado pessoal real em testes (phones ficticios 5511999990001+)
- [x] Token nunca logado nem exposto

### Etapa 06 - Conversa Privada, Redirecionador e Atribuicao
- [x] Interface MessagingProvider com capacidades declaradas (send, receive, interactive, status)
- [x] MockMessagingProvider com fallback numerado para botoes interativos
- [x] createNumberedFallback para provedores sem suporte a botoes
- [x] Modelo RedirectLink: codigo aleatorio alta entropia, expiracao, uso controlado
- [x] Allowlist de destinos (wa.me, api.whatsapp.com, chat.whatsapp.com)
- [x] Endpoint GET /r/:code com validacao de formato, rate limit 30/min
- [x] TrackingClick registrado em cada clique
- [x] Contagem de uso e verificacao de maxUses/expiresAt
- [x] Modelo ConversationMessage com externalMessageId (unique), provider, deliveryStatus
- [x] Modelo ContactPreference: opt-out/opt-in por canal
- [x] Webhook POST /webhook/messaging: recebe mensagem e status
- [x] Idempotencia de webhook por externalMessageId
- [x] handleIncomingMessage: upsert contato, create/reuse conversation, atribuicao por referral
- [x] handleDeliveryStatus: atualiza deliveredAt/readAt
- [x] sendMessage: verifica opt-out, formata interactive, registra mensagem outbound
- [x] attributeConversation: cria participacao e LeadAttribution
- [x] Opt-out e opt-in endpoints com audit log
- [x] CRUD redirect links com RBAC e audit logging
- [x] Frontend MessagesPage: CRUD de redirect links, visualizacao de campanhas
- [x] Testes integracao: 13 testes (create link, disallowed destination, resolve+track, expired, max uses, invalid code, webhook message, webhook idempotent, delivery status, opt-out, deactivate, list filter, auth)

## O que foi testado

- [x] 127 testes passam (89 API + 22 worker + 16 web)
- [x] 8 testes de constraints do banco (PostgreSQL real)
- [x] 8 testes de auth (login, logout, sessao, auditoria)
- [x] 3 testes de RBAC (owner, read_only, sessoes)
- [x] 2 testes de health
- [x] 16 testes de campanhas (CRUD, lifecycle, duplication, versions, auth)
- [x] 7 testes de grupos (CRUD, categorias, filtros, auth)
- [x] 12 testes de importacao (preview, confirm, rollback, student prevails, idempotent, historical, vcard, path traversal)
- [x] 20 testes unitarios de parser CSV (normalizePhone, parseContactsCsv, parseParticipationsCsv, sanitizeString)
- [x] 9 testes do WhatsApp Manager adapter (endpoints, auth, HTTP errors, defaults)
- [x] 12 testes do event processor (entry, exit, re-entry, idempotency, multi-participant, null number, unknown group, non-membership, batch, adicionado/removido, name update)
- [x] 6 testes de integration health API (health empty, health with data, dead-letter, orphan groups, assign, auth)
- [x] 13 testes de messaging (redirect CRUD, resolve+track, expired, max uses, invalid code, webhook message, webhook idempotent, delivery status, opt-out, deactivate, list, auth)
- [x] 1 teste de health do worker
- [x] 16 testes de componentes web (Button, Input, Badge, Alert, EmptyState, Skeleton, App, Login)
- [x] Lint: 0 errors, 0 warnings
- [x] Typecheck: 7/7 packages passam
- [x] Build: 7/7 packages compilam
- [x] Docker compose config valido
- [x] Scan de secrets: 0 encontrados

## Decisoes tomadas

| Decisao                        | Escolha             | ADR           |
|--------------------------------|---------------------|---------------|
| Gerenciador de pacotes         | pnpm workspaces     | ADR-0001      |
| Linguagem                      | TypeScript          | ADR-0001      |
| Framework API                  | Fastify 5           | -             |
| Framework frontend             | React 19 + Vite 6   | -             |
| Banco de dados                 | PostgreSQL 17       | -             |
| Cache e filas                  | Redis 7 + BullMQ    | -             |
| ORM                            | Prisma              | -             |
| Validacao                      | Zod                 | -             |
| Logs                           | Pino                | -             |
| Testes unitarios               | Vitest              | -             |
| Testes E2E                     | Playwright          | -             |
| Modelo de dados                | Eventos imutaveis   | ADR-0002      |
| Deploy                         | EasyPanel + Docker  | -             |
| ESLint                         | v9 flat config      | -             |
| Hashing de senha               | Argon2id            | -             |
| Sessoes                        | Cookie httpOnly     | -             |
| RBAC                           | Permissoes granulares| -            |
| Design system                  | CSS puro + tokens   | -             |
| Roteamento                     | React Router v7     | -             |
| Icones                         | Lucide React        | -             |
| Testes componentes             | Testing Library     | -             |
| CSV parser                     | Manual (sem deps)   | -             |
| File upload                    | @fastify/multipart  | -             |
| Edition numbers                | Referencia historica, nao UUID | - |
| Testes sequenciais             | workspace-concurrency=1 | -        |
| Redirect links                 | Allowlist + codigo aleatorio | -  |
| MessagingProvider              | Interface + mock + fallback | -   |

## Migrations aplicadas

| Migration                | Descricao                         |
|--------------------------|-----------------------------------|
| 20260807215706_init      | Schema completo (30+ tabelas)     |
| 20260807192111_add_campaign_edition_group_priority | editionNumber, inviteLink, priority |

## Integracoes

| Integracao            | Status                | Notas                      |
|-----------------------|-----------------------|----------------------------|
| WhatsApp Manager API  | Implementada (Etapa 05) | Adapter, polling, reconciliacao |
| WhatsApp Messaging    | Interface + mock (Etapa 06) | Provedor real pendente |
| Eduzz                 | Interface pendente     | Contrato pendente          |
| xAI/Grok              | Interface pendente     | API key pendente           |
| Meta Marketing API    | Nao iniciada           | Conta Business pendente    |

## Riscos identificados

| Risco                                    | Impacto | Mitigacao                        |
|------------------------------------------|---------|----------------------------------|
| Docker necessario para testes integracao | Medio   | Testes integracao opcionais local|
| Provedor WhatsApp nao definido           | Alto    | Interface + mock ate definicao   |
| Contrato Eduzz pendente                  | Medio   | Mock e interface antecipada      |
| VPS unica (sem redundancia)             | Alto    | Backups diarios, monitoramento   |
| Dependencia de EasyPanel                 | Baixo   | Docker padrao, portavel          |

## Entradas pendentes do proprietario

| Item                                   | Prioridade | Necessario para |
|----------------------------------------|------------|-----------------|
| Logotipo e identidade visual           | Baixa      | Etapa 06 (UI)   |
| Dominio para staging                   | Media      | Etapa 08 (deploy)|
| Dominio para producao                  | Media      | Etapa 08 (deploy)|
| Escolha de provedor WhatsApp privado   | Alta       | Etapa 06        |
| Contrato e credenciais Eduzz           | Media      | Etapa 07        |
| Conta Meta Business Manager            | Baixa      | Etapa 07        |
| API key xAI/Grok                       | Baixa      | Etapa 07        |

## Proximo passo

**Etapa 06 - Contatos, classificacao e diagnostico**

A Etapa 06 incluira:
- CRUD de contatos com busca e filtros
- Classificacao automatica de contatos por historico
- Diagnostico de contatos via IA
- Paginas frontend de contatos
- Testes de classificacao e diagnostico
