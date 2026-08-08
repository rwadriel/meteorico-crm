# Deploy EasyPanel - Meteorico CRM

## Servicos

### 1. PostgreSQL 17
- Template: PostgreSQL
- Versao: 17
- Volume: /var/lib/postgresql/data (persistente)
- Health check: `pg_isready -U meteorico`
- Backup: diario via pg_dump, rotacao 7 dias
- Variaveis:
  - POSTGRES_USER=meteorico
  - POSTGRES_PASSWORD=(secret)
  - POSTGRES_DB=meteorico_crm

### 2. Redis 7
- Template: Redis
- Versao: 7-alpine
- Volume: /data (persistente)
- Health check: `redis-cli ping`

### 3. API (apps/api)
- Build: Dockerfile em apps/api/Dockerfile
- Porta: 4080
- Health check: GET /health (intervalo 30s, timeout 5s)
- Dominio: api.meteorico.seudominio.com
- Variaveis (secrets):
  - DATABASE_URL=postgresql://meteorico:(senha)@postgres:5432/meteorico_crm
  - REDIS_URL=redis://redis:6379
  - SESSION_SECRET=(gerar com `openssl rand -hex 32`)
  - EDUZZ_WEBHOOK_SECRET=(gerar com `openssl rand -hex 32`)
  - API_PORT=4080
  - API_CORS_ORIGINS=https://app.meteorico.seudominio.com
  - NODE_ENV=production
  - XAI_API_KEY=(opcional)

### 4. Worker (apps/worker)
- Build: Dockerfile em apps/worker/Dockerfile
- Porta: 4081
- Health check: GET / (intervalo 30s, timeout 5s)
- Sem dominio publico (interno)
- Variaveis (secrets):
  - DATABASE_URL=postgresql://meteorico:(senha)@postgres:5432/meteorico_crm
  - REDIS_URL=redis://redis:6379
  - WORKER_PORT=4081
  - WHATSAPP_MANAGER_URL=(url)
  - WHATSAPP_MANAGER_INTEGRATION_TOKEN=(token)
  - WORKER_POLLING_INTERVAL_MS=10000
  - NODE_ENV=production

### 5. Web (apps/web)
- Build: Dockerfile em apps/web/Dockerfile
- Porta: 80 (nginx)
- Health check: GET / (intervalo 30s, timeout 5s)
- Dominio: app.meteorico.seudominio.com
- Sem variaveis de runtime (build-time only via VITE_API_URL)

## Staging vs Producao

| Aspecto | Staging | Producao |
|---------|---------|----------|
| Dominio | staging.meteorico.* | app.meteorico.* |
| DATABASE | meteorico_crm_staging | meteorico_crm |
| Seed | admin com senha padrao | admin com senha forte |
| Rate limit | padrao | padrao |
| Backups | diarios, 3 dias | diarios, 30 dias |
| XAI_API_KEY | opcional | configurar |

## Procedimento de Deploy

### Staging
1. Push para branch `staging`
2. EasyPanel rebuilda automaticamente (ou manual via webhook)
3. Aguardar health check verde
4. Rodar migrations: `pnpm --filter @meteorico/database exec prisma migrate deploy`
5. Seed (primeira vez): `pnpm --filter @meteorico/database exec prisma db seed`
6. Smoke tests: health, login, criar campanha, classificar contato

**IMPORTANTE**: Nunca usar `prisma db push` em staging ou producao. Usar sempre `prisma migrate deploy`.

### Producao
1. **BACKUP** do banco antes de qualquer coisa
2. Push para `main` (requer aprovacao humana)
3. Aguardar build e health check
4. Rodar migrations: `pnpm --filter @meteorico/database exec prisma migrate deploy`
5. Smoke tests
6. Monitorar logs por 30 minutos

### Rollback de migration
Se uma migration falhar:
1. **Nao** executar `prisma migrate reset` em producao (destroi dados)
2. Criar uma nova migration "forward-fix" que reverte as alteracoes
3. Aplicar com `prisma migrate deploy`
4. Se necessario, marcar migration como resolvida: `prisma migrate resolve --rolled-back <migration_name>`

## Rollback

### Rollback de Aplicacao
1. Reverter para imagem anterior no EasyPanel
2. Aguardar health check
3. Verificar que a versao anterior funciona

### Rollback de Banco
1. Parar API e worker
2. Restaurar backup: `pg_restore -d meteorico_crm backup.dump`
3. Reiniciar API e worker
4. Verificar health

## Backup e Restauracao

### Backup Manual
```bash
pg_dump -U meteorico -h localhost meteorico_crm > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restauracao
```bash
psql -U meteorico -h localhost meteorico_crm < backup_YYYYMMDD_HHMMSS.sql
```

### Testar Restauracao (staging)
1. Criar backup de producao
2. Restaurar em staging
3. Verificar que dashboards e dados estao corretos
4. Deletar dados de staging apos teste
