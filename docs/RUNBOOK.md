# Runbook de Incidentes - Meteorico CRM

## Health Checks

| Servico | Endpoint | Intervalo | Acao se falhar |
|---------|----------|-----------|----------------|
| API | GET /health | 30s | Restart container, verificar logs |
| Worker | GET / | 30s | Restart container, verificar cursor |
| PostgreSQL | pg_isready | 10s | Verificar conexoes, disco, logs |
| Redis | redis-cli ping | 10s | Verificar memoria, restart |

## Incidente: API nao responde

1. Verificar logs: `docker logs meteorico-api --tail 100`
2. Verificar health: `curl http://localhost:4080/health`
3. Verificar conexao DB: logs devem mostrar "database connected"
4. Se OOM: aumentar memoria do container
5. Restart: `docker restart meteorico-api`
6. Se persistir: verificar DATABASE_URL e conexoes do PostgreSQL

## Incidente: Worker parou de processar eventos

1. Verificar logs: `docker logs meteorico-worker --tail 100`
2. Verificar cursor: GET /api/integration/health (precisa auth)
3. Se cursor travado: verificar WhatsApp Manager API
4. Se erro de conexao: verificar WHATSAPP_MANAGER_URL
5. Se erro de token: verificar WHATSAPP_MANAGER_INTEGRATION_TOKEN
6. Restart: `docker restart meteorico-worker`
7. Worker retoma do ultimo cursor salvo (idempotente)

## Incidente: Eventos duplicados

1. Verificar tabela processed_events para o event_id
2. Se duplicou: bug no processador, verificar whatsappEventId
3. Se nao duplicou: sistema funcionou, evento e diferente

## Incidente: Diagnostico IA falha

1. Verificar XAI_API_KEY configurada
2. Verificar logs para erro de timeout ou API
3. Sistema usa fallback automatico (resposta fixa)
4. Nenhuma acao urgente necessaria — fluxo continua sem IA

## Incidente: Webhook Eduzz falha

1. Verificar logs para payload recebido
2. Verificar processed_events para idempotencia
3. Se signature invalida: verificar configuracao do webhook no Eduzz
4. Reprocessar: enviar payload novamente (idempotente)

## Incidente: Banco cheio

1. Verificar tamanho: `SELECT pg_database_size('meteorico_crm');`
2. Verificar tabelas maiores: `SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) FROM pg_class ORDER BY pg_total_relation_size(oid) DESC LIMIT 10;`
3. Considerar limpeza de audit_logs antigos (> 90 dias)
4. Considerar limpeza de processed_events antigos (> 30 dias)
5. Aumentar disco se necessario

## Incidente: Rate limit atingido

1. API retorna 429 Too Many Requests
2. Verificar se e ataque: logs com muitos IPs diferentes
3. Se legitimo: ajustar rate limit no codigo
4. Se ataque: bloquear IP no reverse proxy

## Politica de Retencao

| Dados | Retencao | Acao |
|-------|----------|------|
| Audit logs | 90 dias | Deletar antigos periodicamente |
| Processed events | 30 dias | Deletar antigos periodicamente |
| Integration logs | 7 dias | Deletar antigos |
| Sessoes expiradas | 7 dias | Deletar |
| Dados de contato | Indefinida | Anonimizar sob solicitacao |
| Compras/reembolsos | Indefinida | Manter para compliance |

## Contatos de Emergencia

- Responsavel tecnico: verificar com o proprietario
- EasyPanel: painel de controle em easypanel.io
- PostgreSQL: backup diario automatico
