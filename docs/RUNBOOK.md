# Runbook de Incidentes - Meteorico CRM

## Health Checks

| Servico | Endpoint | Intervalo | Acao se falhar |
|---------|----------|-----------|----------------|
| API | GET /health | 30s | Restart container, verificar logs |
| Worker | GET / | 30s | Restart container, verificar cursor |
| Group Manager | GET /api/integration/health (CRM, autenticado) | 60s | Seguir diagnostico abaixo; nao habilitar outbound |
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

Antes de reiniciar, confirme que `WHATSAPP_OUTBOUND_ENABLED=false`. O restart
nao autoriza consumo de `outbound-messages`.

## Incidente: Token Meta expirado ou revogado

1. Acione o kill switch em API e worker: `WHATSAPP_OUTBOUND_ENABLED=false`.
2. Confirme no painel Meta qual credencial foi revogada sem copiar o token para
   tickets ou logs.
3. Gere uma credencial de **System User** dedicada, com a WABA e o app corretos
   atribuídos e apenas as permissoes necessarias.
4. Atualize o secret manager do ambiente; nunca arquivo, comando versionado ou
   mensagem de chat.
5. Reinicie API/worker e valide readiness e webhook sem envio real.
6. Reabilite outbound somente em janela aprovada, depois da auditoria de filas.

## Incidente: Webhook Meta parou

1. Mantenha outbound desabilitado; não use envio como teste de saúde.
2. Verifique HTTPS, callback e assinatura do campo `messages` no painel Meta.
3. Confirme `/health` (liveness) e `/readiness` (PostgreSQL/Redis/integrações).
4. Inspecione apenas códigos HTTP e contagens; não registre payload completo,
   telefones, tokens ou invite links.
5. Valide o challenge e um payload assinado por teste automatizado/mock.
6. Se houve indisponibilidade, espere o retry oficial e confirme a
   idempotência por `ProcessedEvent`.

## Incidente: Group Manager degradado, desconectado ou stale

1. Abra **Integracoes** no CRM e registre apenas: `status`, `connected`,
   `snapshotFresh`, `lastSuccessfulPollAt`, `lastSuccessfulSnapshotAt`,
   `providerSnapshotAt`, `cursorStatus` e o resumo do ultimo erro. Nao copie
   tokens ou URLs internas.
2. Confirme que o endpoint de liveness do worker continua saudavel. Saude do
   processo e readiness da integracao sao sinais diferentes; nao reinicie o
   worker apenas porque a sessao externa esta degradada.
3. Se `disconnected`, abra a UI oficial do Group Manager e reconecte por ela.
   Nao ha endpoint oficial de reconnect no contrato atual e o CRM nao tenta
   automatiza-lo.
4. Se `stale`, compare a idade do snapshot com
   `GROUP_MANAGER_SNAPSHOT_STALE_AFTER_SECONDS` (default 7200). Enquanto estiver
   stale, a reconciliacao fica fail-closed: ausencia nao significa saida e
   presenca antiga nao significa nova participacao.
5. Se `cursorStatus=behind`, aguarde um ciclo de polling e confira se o cursor
   alcanca `providerLastSeq`. Se os dois numeros sao iguais, um cursor sem
   avancar e normal quando nao existem novos eventos.
6. Apos reconectar, aguarde poll e snapshot recentes. O estado esperado e
   `healthy`, `snapshotFresh=true` e `cursorStatus=current`. `connected` pode
   aparecer como inferido porque o provider atual nao publica esse campo.
7. Confirme separadamente que `WHATSAPP_OUTBOUND_ENABLED=false` fora de uma
   janela de envio explicitamente autorizada. A recuperacao desta integracao
   nunca autoriza mensagens.

Durante o incidente, nao corrija participacoes manualmente com base em snapshot
antigo. Eventos incrementais de entrada/saida permanecem idempotentes e devem
ser preservados.

## Incidente: Eventos duplicados

1. Verificar tabela processed_events para o event_id
2. Se duplicou: bug no processador, verificar whatsappEventId
3. Se nao duplicou: sistema funcionou, evento e diferente

## Incidente: Outbound duplicado suspeito

1. Acione imediatamente `WHATSAPP_OUTBOUND_ENABLED=false` em API e worker e
   reinicie ambos para aplicar a configuração.
2. Não exclua registros. Compare somente contagens por `idempotency_key`,
   `provider_message_id` e status.
3. Pause a campanha afetada sem criar uma nova mensagem.
4. Inspecione jobs `waiting`, `delayed`, `active` e `failed` da fila
   `outbound-messages`; não faça retry em massa.
5. Preserve evidências em `OutboundRecord`/audit log e aplique forward-fix.

## Incidente: Redis indisponível

1. Confirme `/readiness` degradado e `redis-cli ping` sem revelar a URL.
2. Mantenha outbound desabilitado e não recrie filas manualmente.
3. Verifique disco, memória, persistência e logs do Redis no EasyPanel.
4. Após recuperar, audite todas as contagens de jobs antes de iniciar worker.
5. Confirme que nenhum job não autorizado poderá sair ao reabilitar outbound.

## Incidente: Campanha sem grupo disponível

1. Não invente link nem grupo e não altere classificação.
2. Confirme campanha, categoria, capacidade, `isActive` e invite link no CRM.
3. Mantenha o contato sem outbound; `no_available_group`/`no_invite_link` é o
   comportamento fail-closed esperado.
4. Cadastre grupos/links somente após revisão e aprovação operacional.

## Emergency outbound disable

1. Defina `WHATSAPP_OUTBOUND_ENABLED=false` na API **e** no worker.
2. Reinicie/deploy apenas esses serviços para aplicar a flag.
3. Confirme que o worker de `outbound-messages` não iniciou e que a API retorna
   bloqueio antes de enfileirar.
4. Registre contagens de pending/retry/scheduled, sem enviar ou excluir dados.
5. A recuperação exige auditoria das filas e nova autorização explícita.

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

## Rollback de aplicação e banco

- Aplicação: identifique o último commit/imagem saudável no EasyPanel, mantenha
  outbound desabilitado, selecione a imagem anterior do mesmo serviço e valide
  `/health` e `/readiness`. Não faça rollback real enquanto staging estiver
  saudável.
- Migrations Prisma não têm rollback automático. A política é backup validado
  antes do deploy + forward-fix. Restore só é aceitável de forma controlada,
  com serviços parados, alvo explicitamente confirmado e aprovação humana.
- Nunca crie `DOWN` destrutivo apenas por simetria nem use `prisma db push` nos
  ambientes gerenciados.

## Auditoria obrigatória antes de reabilitar outbound

1. Confirme `WHATSAPP_OUTBOUND_ENABLED=false` em API e worker.
2. Registre contagens BullMQ de `waiting`, `delayed`, `active`, `failed` e
   `waiting-children` e contagens de `OutboundRecord` pending/failed/retriable.
3. Classifique qualquer item antigo. Não faça retry, promote ou clean em massa.
4. Exija zero itens não autorizados capazes de envio automático.
5. Só depois de aprovação específica habilite API e worker durante uma janela
   controlada; ao encerrar, desabilite novamente.

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
