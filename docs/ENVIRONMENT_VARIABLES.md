# Variaveis de Ambiente - Meteorico CRM

## Obrigatorias

| Variavel | Servico | Descricao | Exemplo | Como testar |
|----------|---------|-----------|---------|-------------|
| DATABASE_URL | api, worker | URL de conexao PostgreSQL | postgresql://user:pass@host:5432/db | `pnpm --filter @meteorico/database exec prisma db push` |
| SESSION_SECRET | api | Segredo para cookies de sessao (min 32 chars) | (gerar com `openssl rand -hex 32`) | Login/logout funciona |
| API_PORT | api | Porta HTTP da API | 4080 | `curl http://localhost:4080/health` |
| WORKER_PORT | worker | Porta HTTP do worker | 4081 | `curl http://localhost:4081/` |

## Opcionais

| Variavel | Servico | Descricao | Default | Como testar |
|----------|---------|-----------|---------|-------------|
| NODE_ENV | todos | Ambiente de execucao | development | - |
| API_CORS_ORIGINS | api | Origens CORS separadas por virgula | http://localhost:5173 | Request cross-origin funciona |
| REDIS_URL | api, worker | URL de conexao Redis (BullMQ) | redis://localhost:6379 | GET /api/queues/status |
| WHATSAPP_MANAGER_URL | worker | URL da API WhatsApp Manager | - | Health check do worker |
| WHATSAPP_MANAGER_INTEGRATION_TOKEN | worker | Token de integracao WhatsApp Manager | - | Worker conecta e drena eventos |
| XAI_API_KEY | api | API key xAI/Grok para diagnostico | - | POST /api/diagnosis/playground |
| XAI_API_BASE_URL | api | URL base da API xAI | https://api.x.ai/v1 | - |
| XAI_MODEL | api | Modelo xAI a usar | grok-3-mini | - |
| EDUZZ_WEBHOOK_SECRET | api | HMAC secret para validacao de webhook Eduzz | (gerar com `openssl rand -hex 32`) | POST /webhook/eduzz |
| WORKER_POLLING_INTERVAL_MS | worker | Intervalo de polling em ms | 10000 | Logs do worker |
| WORKER_RECONCILIATION_INTERVAL_MS | worker | Intervalo de reconciliacao em ms | 3600000 | Logs do worker |
| SEED_ADMIN_EMAIL | database | Email do admin inicial no seed | admin@meteorico.dev | Login com credenciais |
| SEED_ADMIN_PASSWORD | database | Senha do admin inicial no seed | meteorico-dev-2026 | Login com credenciais |
| SEED_ADMIN_NAME | database | Nome do admin inicial | Admin Dev | - |

## Meta WhatsApp Cloud API

Configure os valores somente no gerenciador de secrets do ambiente. O
repositorio e o `.env.example` documentam apenas os nomes.

| Variavel | Servico | Descricao | Obrigatoria em staging |
|----------|---------|-----------|------------------------|
| DEPLOYMENT_ENV | api, worker | Ambiente de execucao; use `staging` para ativar a barreira de destinatarios | Sim |
| WHATSAPP_PRIVATE_PROVIDER | api, worker | Adapter de mensageria; `meta_cloud` ativa a API oficial | Sim |
| WHATSAPP_OUTBOUND_ENABLED | api, worker | Trava fail-closed; somente `true` permite enfileirar e consumir outbound | Sim (`false` fora de uma janela de envio aprovada) |
| META_WHATSAPP_ACCESS_TOKEN | api, worker | Token do System User com permissoes minimas de WhatsApp | Sim |
| META_WHATSAPP_PHONE_NUMBER_ID | api, worker | Identificador do numero da Cloud API | Sim |
| META_WHATSAPP_WABA_ID | api, worker | Identificador da conta WhatsApp Business autorizada | Sim |
| META_WHATSAPP_VERIFY_TOKEN | api | Segredo aleatorio usado no desafio GET do webhook | Sim |
| META_APP_SECRET | api | App Secret usado no HMAC SHA-256 do corpo bruto | Sim |
| META_GRAPH_API_VERSION | api, worker | Versao fixada da Graph API | Nao (`v25.0`) |
| WHATSAPP_STAGING_ALLOWLIST | api, worker | Telefones E.164 separados por virgula autorizados a receber em staging | Sim |

O worker nao precisa do verify token. O App Secret e obrigatorio somente na
API, que recebe o webhook. API e worker aplicam a allowlist separadamente.

## Seguranca

- NUNCA colocar valores reais no repositorio
- Usar secrets do EasyPanel ou .env local (gitignored)
- SESSION_SECRET deve ter pelo menos 32 caracteres de alta entropia
- EDUZZ_WEBHOOK_SECRET e obrigatorio em staging/producao; sem ele, webhook retorna 503
- META_WHATSAPP_ACCESS_TOKEN, META_APP_SECRET e META_WHATSAPP_VERIFY_TOKEN nunca devem ser logados
- WHATSAPP_STAGING_ALLOWLIST deve permanecer restrita aos numeros de teste em staging
- WHATSAPP_OUTBOUND_ENABLED deve permanecer `false` ate existir autorizacao explicita para a janela de envio
- Tokens de integracao sao enviados apenas em headers Authorization
- XAI_API_KEY nunca e logada (redact do Pino)
