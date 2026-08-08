# Estado do Projeto - Meteorico CRM

Ultima atualizacao: 2026-08-07

## Etapa atual

**Etapa 04 - Campanhas, grupos, versoes e importacao inicial** (CONCLUIDA)

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

## O que foi testado

- [x] 86 testes passam (86 = 70 API + 16 web)
- [x] 8 testes de constraints do banco (PostgreSQL real)
- [x] 8 testes de auth (login, logout, sessao, auditoria)
- [x] 3 testes de RBAC (owner, read_only, sessoes)
- [x] 2 testes de health
- [x] 16 testes de campanhas (CRUD, lifecycle, duplication, versions, auth)
- [x] 7 testes de grupos (CRUD, categorias, filtros, auth)
- [x] 12 testes de importacao (preview, confirm, rollback, student prevails, idempotent, historical, vcard, path traversal)
- [x] 12 testes unitarios de parser CSV (normalizePhone, parseContactsCsv, parseParticipationsCsv, sanitizeString)
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

## Migrations aplicadas

| Migration                | Descricao                         |
|--------------------------|-----------------------------------|
| 20260807215706_init      | Schema completo (30+ tabelas)     |
| 20260807192111_add_campaign_edition_group_priority | editionNumber, inviteLink, priority |

## Integracoes

| Integracao            | Status                | Notas                      |
|-----------------------|-----------------------|----------------------------|
| WhatsApp Manager API  | Kit disponivel, mockada | Implementacao na Etapa 06 |
| WhatsApp Messaging    | Interface pendente     | Provedor nao definido      |
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
| Logotipo e identidade visual           | Baixa      | Etapa 05 (UI)   |
| Dominio para staging                   | Media      | Etapa 08 (deploy)|
| Dominio para producao                  | Media      | Etapa 08 (deploy)|
| Escolha de provedor WhatsApp privado   | Alta       | Etapa 06        |
| Contrato e credenciais Eduzz           | Media      | Etapa 07        |
| Conta Meta Business Manager            | Baixa      | Etapa 07        |
| API key xAI/Grok                       | Baixa      | Etapa 07        |

## Proximo passo

**Etapa 05 - Contatos, classificacao e diagnostico**

A Etapa 05 incluira:
- CRUD de contatos com busca e filtros
- Classificacao automatica de contatos por historico
- Diagnostico de contatos via IA
- Paginas frontend de contatos
- Testes de classificacao e diagnostico
