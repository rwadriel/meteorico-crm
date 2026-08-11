# Deployment - Meteorico CRM

## Infraestrutura

### Servidor

- **Provedor**: VPS
- **IP**: 72.61.52.133
- **Gerenciador**: EasyPanel
- **SO**: Linux (gerenciado pelo EasyPanel)

### Servicos

| Servico    | Tipo      | Porta interna | Descricao                     |
|------------|-----------|---------------|-------------------------------|
| web        | Container | 5173          | Frontend React (Nginx)        |
| api        | Container | 3000          | Servidor Fastify              |
| worker     | Container | -             | Processamento BullMQ          |
| postgres   | Managed   | 5432          | PostgreSQL (EasyPanel)        |
| redis      | Managed   | 6379          | Redis (EasyPanel)             |

## Docker

### Multi-stage build

Todos os servicos usam builds multi-stage para minimizar tamanho
da imagem.

#### API / Worker

```dockerfile
# Exemplo conceitual - sera criado na Etapa 08

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/*/package.json packages/*/
RUN corepack enable && pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS build
COPY . .
RUN pnpm --filter @meteorico/api build
RUN pnpm --filter @meteorico/worker build

# Stage 3: Production (API)
FROM node:20-alpine AS api
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]

# Stage 3: Production (Worker)
FROM node:20-alpine AS worker
WORKDIR /app
COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/worker.js"]
```

#### Web

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @meteorico/web build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
```

### Docker Compose (desenvolvimento)

```yaml
# docker-compose.yml (conceitual)
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: meteorico
      POSTGRES_USER: meteorico
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      target: api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://meteorico:${POSTGRES_PASSWORD}@postgres:5432/meteorico
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  worker:
    build:
      context: .
      target: worker
    environment:
      - DATABASE_URL=postgresql://meteorico:${POSTGRES_PASSWORD}@postgres:5432/meteorico
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  web:
    build:
      context: .
      target: web-serve
    ports:
      - "5173:5173"
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
```

## Ambientes

### Staging

- **Proposito**: Validacao antes de producao
- **Dominio**: A definir (entrada pendente do proprietario)
- **Dados**: Copia anonimizada de producao ou seed
- **Deploy**: Automatico a cada push em `develop`

### Producao

- **Proposito**: Ambiente final
- **Dominio**: A definir (entrada pendente do proprietario)
- **Dados**: Dados reais
- **Deploy**: Manual ou automatico a cada push em `main` (com aprovacao)

## Variaveis de ambiente

### Aplicacao (API/Worker)

| Variavel                     | Descricao                              | Obrigatoria |
|------------------------------|----------------------------------------|-------------|
| NODE_ENV                     | Ambiente (development/staging/production) | Sim      |
| PORT                         | Porta do servidor API                  | Sim         |
| DATABASE_URL                 | URL de conexao PostgreSQL              | Sim         |
| REDIS_URL                    | URL de conexao Redis                   | Sim         |
| SESSION_SECRET               | Segredo para sessoes                   | Sim         |
| ENCRYPTION_KEY               | Chave AES-256 para tokens              | Sim         |
| CORS_ORIGIN                  | Dominio do frontend                    | Sim         |
| LOG_LEVEL                    | Nivel de log (debug/info/warn/error)   | Nao         |

### Integracoes

| Variavel                     | Descricao                              | Obrigatoria |
|------------------------------|----------------------------------------|-------------|
| WHATSAPP_MANAGER_URL         | URL base do WhatsApp Manager           | Sim         |
| WHATSAPP_MANAGER_API_KEY     | API key do WhatsApp Manager            | Sim         |
| WHATSAPP_MANAGER_POLL_INTERVAL | Intervalo de polling em ms           | Nao         |
| EDUZZ_API_KEY                | API key do Eduzz                       | Nao (futuro)|
| EDUZZ_API_SECRET             | Secret do Eduzz                        | Nao (futuro)|
| XAI_API_KEY                  | API key do xAI/Grok                    | Nao (futuro)|
| XAI_MODEL                    | Modelo xAI (default: grok-2)           | Nao (futuro)|
| DEPLOYMENT_ENV               | Ativa protecoes especificas do ambiente | Sim       |
| WHATSAPP_PRIVATE_PROVIDER    | `mock` ou `meta_cloud`                 | Sim         |
| META_WHATSAPP_ACCESS_TOKEN   | Token do System User Meta              | Sim (Meta)  |
| META_WHATSAPP_PHONE_NUMBER_ID| Phone Number ID da Cloud API           | Sim (Meta)  |
| META_WHATSAPP_WABA_ID        | WABA autorizada                        | Sim (Meta)  |
| META_WHATSAPP_VERIFY_TOKEN   | Token aleatorio do desafio do webhook  | Sim (API)   |
| META_APP_SECRET              | App Secret para assinatura do webhook  | Sim (API)   |
| META_GRAPH_API_VERSION       | Versao fixada da Graph API             | Nao         |
| WHATSAPP_STAGING_ALLOWLIST   | E.164 autorizados, separados por virgula | Sim (staging) |

No EasyPanel de staging, configure a API com todos os itens Meta acima. No
worker, configure provider, access token, Phone Number ID, WABA ID, versao,
ambiente e allowlist. Nao configure valores Meta no frontend.

### Frontend (build-time)

| Variavel                     | Descricao                              | Obrigatoria |
|------------------------------|----------------------------------------|-------------|
| VITE_API_URL                 | URL base da API                        | Sim         |
| VITE_WS_URL                  | URL do WebSocket                       | Sim         |

## Health checks

### API

```
GET /health

Response 200:
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 123456,
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}

Response 503:
{
  "status": "degraded",
  "checks": {
    "database": "ok",
    "redis": "error"
  }
}
```

### Worker

O worker expoe metricas via endpoint HTTP (porta separada) ou via
Redis (chave com timestamp do ultimo heartbeat).

```
Verificacao: chave Redis `worker:heartbeat` atualizada a cada 30s
Alerta: se `worker:heartbeat` tem mais de 2 minutos
```

### EasyPanel

Configurar health checks no EasyPanel:

- **API**: HTTP GET /health, intervalo 30s, timeout 5s
- **Worker**: Verificacao de processo (ou endpoint HTTP dedicado)
- **Web**: HTTP GET /, intervalo 60s

## Backup

### PostgreSQL

- **Frequencia**: Diario (automatico via EasyPanel ou cron)
- **Retencao**: 7 dias de backups diarios, 4 semanais
- **Tipo**: pg_dump comprimido
- **Armazenamento**: Volume separado no VPS
- **Teste de restauracao**: Mensal (manual)

### Redis

- **Persistencia**: RDB snapshots a cada 5 minutos
- **Backup**: Incluido no backup diario do VPS
- **Nota**: Redis armazena dados efemeros (filas, cache, sessoes).
  Perda de dados Redis nao e critica - filas sao reprocessadas,
  sessoes exigem relogin, cache se reconstroi.

### Procedimento de restauracao

```bash
# 1. Parar servicos
easypanel stop meteorico-api
easypanel stop meteorico-worker

# 2. Restaurar banco
pg_restore -d meteorico backup_file.dump

# 3. Reiniciar servicos
easypanel start meteorico-api
easypanel start meteorico-worker

# 4. Verificar health
curl http://localhost:3000/health
```

## Deploy no EasyPanel

### Estrutura de projeto no EasyPanel

```
Projeto: meteorico-crm
  Servicos:
    - meteorico-web (Docker, porta 5173)
    - meteorico-api (Docker, porta 3000)
    - meteorico-worker (Docker, sem porta publica)
    - meteorico-postgres (PostgreSQL managed)
    - meteorico-redis (Redis managed)
```

### Fluxo de deploy

```
1. Push para branch (develop ou main)
2. Webhook notifica EasyPanel
3. EasyPanel faz pull do repositorio
4. Build Docker multi-stage
5. Health check do novo container
6. Swap de containers (zero downtime)
7. Container antigo e removido
```

### Rollback

- EasyPanel mantem a imagem anterior
- Rollback via interface do EasyPanel (1 clique)
- Em caso de emergencia: reverter commit e redeployar

## Observabilidade

### Logs

- **Formato**: JSON estruturado (Pino)
- **Destino**: stdout (capturado pelo EasyPanel/Docker)
- **Visualizacao**: EasyPanel logs viewer
- **Retencao**: 7 dias no EasyPanel

### Metricas (futuro)

- Requisicoes por segundo
- Latencia P50/P95/P99
- Tamanho de filas BullMQ
- Eventos processados por minuto
- Erros por minuto

### Alertas (futuro)

- Health check falha por 2+ minutos
- Worker heartbeat ausente por 2+ minutos
- Fila com mais de 1000 itens pendentes
- Taxa de erro acima de 5%
- Disco acima de 80%
