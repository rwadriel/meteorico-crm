# Seguranca - Meteorico CRM

## Objetivo

Atingir conformidade com OWASP ASVS Level 2 (Application Security
Verification Standard). Este documento descreve o modelo de ameacas
inicial e as medidas de seguranca planejadas.

## Modelo de ameacas

### Ativos protegidos

1. **Dados de contatos**: Numeros de telefone, nomes, historico de
   interacoes. Dados pessoais sujeitos a LGPD.
2. **Credenciais de integracao**: Tokens de API do WhatsApp Manager,
   Eduzz, xAI. Acesso indevido compromete servicos externos.
3. **Sessoes administrativas**: Acesso ao painel de gestao.
4. **Dados de compra**: Informacoes financeiras vindas do Eduzz.

### Vetores de ataque considerados

| Vetor                    | Risco | Mitigacao                        |
|--------------------------|-------|----------------------------------|
| Credential stuffing      | Alto  | Rate limiting, Argon2id          |
| XSS                      | Alto  | CSP, sanitizacao, React escape   |
| CSRF                     | Medio | Token CSRF, SameSite cookie      |
| SQL Injection            | Alto  | Prisma (parameterized queries)   |
| SSRF                     | Medio | Allowlist de URLs externas       |
| Broken access control    | Alto  | RBAC com checagem por rota       |
| Data exposure em logs    | Medio | Redacao automatica de PII        |
| Token theft              | Alto  | httpOnly, Secure, SameSite       |
| Dependency vulnerabilities| Medio | npm audit, Snyk/Dependabot      |

## Autenticacao

### Senhas

- **Hashing**: Argon2id com parametros recomendados pela OWASP
  - memory: 19456 KiB (19 MiB)
  - iterations: 2
  - parallelism: 1
- **Politica de senha**: Minimo 12 caracteres, sem restricoes de
  caracteres especificos (conformidade NIST 800-63B)
- **Verificacao contra listas de senhas comprometidas**: Futuro
  (via k-anonymity com API HaveIBeenPwned)

### Sessoes

- **Armazenamento**: Cookie httpOnly, Secure, SameSite=Lax
- **Duracao**: 24 horas (configuravel)
- **Renovacao**: Sliding window - renovada a cada requisicao
- **Invalidacao**: Logout explicito, expiracao, mudanca de senha
- **Token**: 256 bits de entropia, armazenado como hash no banco
- **Multiplas sessoes**: Permitidas, com listagem e revogacao individual

### MFA (Multi-Factor Authentication)

- **Status**: Preparado na arquitetura (MFA-ready), nao implementado
  na Etapa 01
- **Plano**: TOTP (Google Authenticator, Authy) na Etapa futura
- **Fluxo**: Login com senha -> verificacao TOTP -> sessao criada

## Autorizacao (RBAC)

### Perfis de acesso

| Perfil    | Descricao                                          |
|-----------|------------------------------------------------------|
| owner     | Acesso total. Unico por instalacao. Gerencia admins. |
| admin     | Gerencia campanhas, contatos, configuracoes.         |
| operator  | Opera campanhas, visualiza contatos, envia mensagens.|
| analyst   | Somente leitura em dados e relatorios.               |
| read_only | Somente leitura em dashboard.                        |

### Modelo de permissoes

Permissoes sao granulares por recurso e acao:

```
permission = (resource, action)
resource   = campaigns | contacts | groups | messages | settings | users | reports
action     = create | read | update | delete | export
```

Cada perfil tem um conjunto de permissoes. A verificacao ocorre em
middleware do Fastify, antes de chegar ao controller.

### Principios

- **Deny by default**: Rotas sem permissao explicita sao bloqueadas
- **Least privilege**: Cada perfil tem o minimo necessario
- **Verificacao em camadas**: Middleware de rota + verificacao no service

## Protecao de dados

### Dados pessoais (LGPD)

- Numeros de telefone sao dados pessoais
- Armazenados com acesso controlado por RBAC
- Redacao automatica em logs (ultimos 4 digitos visiveis)
- Exportacao com controle de acesso

### Tokens e credenciais

- **Armazenamento**: Criptografia simetrica (AES-256-GCM) para tokens
  de integracao armazenados no banco
- **Chave de criptografia**: Via variavel de ambiente, nunca no codigo
- **Rotacao**: Suporte a rotacao de chaves sem downtime
- **Logs**: Tokens nunca aparecem em logs (redacao automatica)

### Dados em transito

- **HTTPS**: Obrigatorio em producao (TLS 1.2+)
- **Headers de seguranca**: Via Fastify helmet
  - Strict-Transport-Security
  - Content-Security-Policy
  - X-Content-Type-Options
  - X-Frame-Options
  - X-XSS-Protection

### Dados em repouso

- **Banco**: Criptografia no nivel do disco (VPS provider)
- **Backups**: Criptografados
- **Tokens de integracao**: AES-256-GCM no campo do banco

## Validacao de entrada

### Zod schemas

Toda entrada do usuario e validada com Zod antes de chegar ao service:

- Request body
- Query parameters
- Path parameters
- Headers relevantes

### Sanitizacao

- Strings sao trimmed
- HTML e escapado (React faz isso por padrao)
- Numeros de telefone sao normalizados para E.164
- UUIDs sao validados por formato

### Limites

- Tamanho maximo de request body: 1 MB
- Tamanho maximo de upload: 10 MB (importacoes)
- Profundidade maxima de JSON: 10 niveis

## CORS

```typescript
// Configuracao planejada
{
  origin: [FRONTEND_URL],     // Apenas o dominio do frontend
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,          // Cookies
  maxAge: 86400               // 24h cache de preflight
}
```

## CSRF

- **Token CSRF**: Gerado por sessao, validado em mutacoes
- **SameSite cookie**: Lax (protecao adicional)
- **Verificacao de Origin/Referer**: Em requisicoes de mutacao

## Rate Limiting

### Limites planejados

| Endpoint          | Limite          | Janela |
|-------------------|-----------------|--------|
| POST /auth/login  | 5 tentativas    | 15 min |
| POST /auth/*      | 10 requisicoes  | 15 min |
| API geral         | 100 requisicoes | 1 min  |
| Importacao        | 5 requisicoes   | 1 hora |
| Webhooks          | 50 requisicoes  | 1 min  |

### Implementacao

- Plugin `@fastify/rate-limit`
- Armazenamento: Redis
- Identificacao: IP + sessao de usuario
- Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- Resposta: 429 Too Many Requests

## Audit Logging

### O que e registrado

- Login/logout
- Criacao, atualizacao e exclusao de recursos
- Mudancas de configuracao
- Acoes em massa (importacao, exportacao)
- Erros de autorizacao
- Tentativas de login falhas

### Formato

```json
{
  "user_id": "uuid",
  "action": "campaign.create",
  "resource": "campaigns",
  "resource_id": "uuid",
  "old_value": null,
  "new_value": { "name": "Campanha 01" },
  "ip_address": "x.x.x.x",
  "user_agent": "...",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Retencao

- Audit logs sao retidos por 1 ano
- Nao sao editaveis ou excluiveis (append-only)
- Acesso restrito ao perfil owner

## Gestao de segredos

### Variaveis de ambiente

Segredos sao configurados via variaveis de ambiente, nunca no codigo:

- `DATABASE_URL` - Conexao PostgreSQL
- `REDIS_URL` - Conexao Redis
- `SESSION_SECRET` - Segredo para assinatura de sessao
- `ENCRYPTION_KEY` - Chave AES-256 para tokens de integracao
- `WHATSAPP_MANAGER_API_KEY` - API key do WhatsApp Manager
- `EDUZZ_API_KEY` - API key do Eduzz (futuro)
- `XAI_API_KEY` - API key do xAI/Grok (futuro)

### Praticas

- `.env` no `.gitignore` (nunca commitado)
- `.env.example` com nomes (sem valores)
- EasyPanel gerencia variaveis em producao
- Rotacao de segredos documentada em runbook

## Seguranca de dependencias

### Ferramentas

- `pnpm audit` em CI/CD
- Dependabot ou Snyk para alertas automaticos
- Lockfile (`pnpm-lock.yaml`) commitado

### Processo

1. Alertas de vulnerabilidade sao triados semanalmente
2. Vulnerabilidades criticas sao corrigidas em 24 horas
3. Atualizacoes de dependencias sao testadas antes de merge

## Checklist de seguranca por etapa

### Etapa 01 (Fundacao)

- [x] `.env.example` sem valores reais
- [x] `.gitignore` inclui `.env`, `node_modules`, `.prisma`
- [x] Headers de seguranca configurados (helmet)
- [x] CORS restrito ao dominio do frontend
- [x] Validacao Zod em schemas compartilhados

### Etapa 02 (Schema)

- [x] Argon2id para senhas
- [x] Sessoes httpOnly com expiracao
- [x] RBAC implementado (67 permissoes)
- [x] Criptografia de tokens de integracao (AES-256-GCM)
- [x] Audit log funcional

### Etapa 10.1 (Hardening Pre-Staging)

- [x] Swagger /docs desabilitado em producao
- [x] RBAC em todas as novas rotas (contacts, audit-logs, settings, queues)
- [x] Eduzz webhook: HMAC-SHA256 com timingSafeEqual (sem mock em producao)
- [x] Campos sensiveis mascarados nas APIs (phone, email)
- [x] Rate limiting ativo (global + auth + webhooks)
- [x] Redacao de PII em logs (pino redact)
- [x] Upload limitado a 10MB
- [x] BullMQ com idempotencia (nenhuma mensagem duplicada)
- [ ] CSRF tokens (SameSite=Lax e suficiente para o cenario atual)
- [ ] Testes de seguranca automatizados (futuro)
- [ ] Penetration testing manual (futuro)
