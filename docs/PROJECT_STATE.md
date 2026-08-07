# Estado do Projeto - Meteorico CRM

Ultima atualizacao: 2026-08-07

## Etapa atual

**Etapa 03 - Design system e painel administrativo base** (CONCLUIDA)

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
- [x] Placeholder pages: Campanhas, Grupos, Contatos, Mensagens, Fluxos, IA, Integracoes, Importacoes, Auditoria, Configuracoes
- [x] Router com rotas protegidas e redirect
- [x] Responsivo (mobile sidebar overlay, breakpoints 1024px e 640px)
- [x] Acessibilidade: focus-visible, aria-labels, role attributes, prefers-reduced-motion
- [x] Testes de componentes (16 testes web)

## O que foi testado

- [x] 86 testes passam (14 test files)
- [x] 8 testes de constraints do banco (PostgreSQL real)
- [x] 8 testes de auth (login, logout, sessao, auditoria)
- [x] 3 testes de RBAC (owner, read_only, sessoes)
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

## Migrations aplicadas

| Migration                | Descricao                         |
|--------------------------|-----------------------------------|
| 20260807215706_init      | Schema completo (30+ tabelas)     |

## Integracoes

| Integracao            | Status                | Notas                      |
|-----------------------|-----------------------|----------------------------|
| WhatsApp Manager API  | Kit disponivel, mockada | Implementacao na Etapa 04 |
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
| Documentacao API de participacoes      | Alta       | Etapa 04        |
| Escolha de provedor WhatsApp privado   | Alta       | Etapa 06        |
| Contrato e credenciais Eduzz           | Media      | Etapa 07        |
| Conta Meta Business Manager            | Baixa      | Etapa 07        |
| API key xAI/Grok                       | Baixa      | Etapa 07        |

## Proximo passo

**Etapa 04 - API CRUD e logica de negocio**

A Etapa 04 incluira:
- CRUD de campanhas, contatos, grupos
- Logica de classificacao integrada
- Endpoints de participacoes
- Validacao Zod em todas as rotas
- Testes de API completos
