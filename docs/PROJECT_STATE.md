# Estado do Projeto - Meteorico CRM

Ultima atualizacao: 2026-08-08

## Etapa atual

**Etapa 10.1 - Hardening Pre-Staging** (CONCLUIDA)

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
- [x] Schema Prisma completo (31 modelos)
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
- [x] Campaign CRUD com timezone, captationStartsAt, startsAt, endsAt
- [x] Campaign lifecycle: activate, complete, archive
- [x] Campaign duplication: copia grupos, +7 dias, incrementa editionNumber, copia timezone
- [x] Group CRUD: 5 categorias
- [x] CSV import: parser manual, sanitizacao formula injection
- [x] Phone normalization: E.164 (7-15 digits, BR auto-prefix)
- [x] Import preview, confirm, rollback
- [x] Frontend: CampaignsPage, GroupsPage, ImportsPage

### Etapa 05 - Consumidor da API de Grupos e Reconciliacao
- [x] WhatsApp Manager adapter, event processor, reconciliation
- [x] Worker polling loop, cursor persistence, graceful shutdown
- [x] Frontend IntegrationsPage

### Etapa 06 - Conversa Privada, Redirecionador e Atribuicao
- [x] MessagingProvider interface + mock
- [x] RedirectLink com allowlist, tracking, opt-out
- [x] LeadAttribution com campos Meta (metaCampaignId, metaAdsetId, metaAdId, creativeId, placement, trackingCode, clickedAt, confidence)

### Etapa 07 - Motor de Classificacao e Integracoes
- [x] classifyContact deterministico com regras configuraveis
- [x] allocateGroup por categoria, prioridade e capacidade

### Etapa 08 - Mensagens, Botoes, Fluxos e Grok
- [x] Templates versionados com variaveis allowlisted
- [x] Flow builder com triggers/steps/conditions
- [x] xAI/Grok adapter, diagnostico para veteranos
- [x] Knowledge base, playground sandbox

### Etapa 09 - Dashboards, Eduzz, Trafego e Relatorios
- [x] Dashboard global e por campanha
- [x] Comparacao entre campanhas
- [x] Eduzz webhook (purchase, refund, cancellation)
- [x] Exportacao CSV segura

### Etapa 10 - Auditoria Final
- [x] 13 cenarios E2E
- [x] Documentacao completa
- [x] Scan de segredos: 0 encontrados

### Etapa 10.1 - Hardening Pre-Staging
- [x] **Campanhas**: timezone por campanha, captationStartsAt separado de startsAt
- [x] **Atribuicao**: meta_campaign_id, meta_adset_id, meta_ad_id, creative_id, placement, tracking_code, clicked_at, confidence
- [x] **Contatos**: email como campo proprio (com indice), compativel com metadata existente
- [x] **Filas BullMQ**: outbound-messages e integration-tasks com retry exponencial, idempotencia, dead-letter, observabilidade (GET /api/queues/status)
- [x] **Eduzz seguro**: HmacEduzzProvider com HMAC-SHA256+timingSafeEqual, MockEduzzProvider apenas em NODE_ENV=test, 503 quando secret nao configurado
- [x] **Frontend completo**: ContactsPage (lista/busca/filtros/stats), AuditPage (logs com filtros), FlowsPage (CRUD), AiPage (knowledge base), SettingsPage (CRUD system settings)
- [x] **Seguranca**: Swagger /docs desabilitado em producao, RBAC em todas as novas rotas, campos sensiveis mascarados (phone, email)
- [x] **Testes**: 19 novos testes (Eduzz provider, campaign schema, queue idempotency)
- [x] **Documentacao**: PROJECT_STATE.md atualizado

## O que foi testado

- [x] 209 testes passam (171 API + 22 worker + 16 web)
- [x] Lint: 0 errors, 0 warnings
- [x] Typecheck: 7/7 packages passam
- [x] Build: 7/7 packages compilam
- [x] Migration em banco limpo: OK
- [x] Migration sobre estrutura existente: OK

## Decisoes tomadas

| Decisao                        | Escolha             |
|--------------------------------|---------------------|
| Gerenciador de pacotes         | pnpm workspaces     |
| Framework API                  | Fastify 5           |
| Framework frontend             | React 19 + Vite 6   |
| Banco de dados                 | PostgreSQL 17       |
| Cache e filas                  | Redis 7 + BullMQ    |
| ORM                            | Prisma 6            |
| Validacao                      | Zod                 |
| Logs                           | Pino (com redact)   |
| Testes                         | Vitest              |
| Deploy                         | EasyPanel + Docker  |
| Hashing de senha               | Argon2id            |
| Sessoes                        | Cookie httpOnly     |
| Eduzz webhook auth             | HMAC-SHA256         |

## Integracoes

| Integracao            | Status                |
|-----------------------|-----------------------|
| WhatsApp Manager API  | Implementada (Etapa 05) |
| WhatsApp Messaging    | Interface + mock      |
| Eduzz                 | HMAC real + mock test |
| xAI/Grok              | Adapter implementado  |
| Meta Marketing API    | Schema preparado, API nao integrada |
| BullMQ Queues         | Implementado (outbound + integration) |

## Proximo passo

**Merge para main** - Requer aprovacao humana explicita.
