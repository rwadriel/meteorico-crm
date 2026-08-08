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

## Seguranca

- NUNCA colocar valores reais no repositorio
- Usar secrets do EasyPanel ou .env local (gitignored)
- SESSION_SECRET deve ter pelo menos 32 caracteres de alta entropia
- EDUZZ_WEBHOOK_SECRET e obrigatorio em staging/producao; sem ele, webhook retorna 503
- Tokens de integracao sao enviados apenas em headers Authorization
- XAI_API_KEY nunca e logada (redact do Pino)
