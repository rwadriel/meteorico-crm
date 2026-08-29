# Checklist de Go-Live - Meteorico CRM v1.0.0

## Pre-Deploy

- [ ] Todos os testes passam (unit, integration, E2E)
- [ ] Lint e typecheck passam em todos os packages
- [ ] Build passa em todos os packages
- [ ] Zero segredos no repositorio (grep -rn "password\|secret\|token\|api_key")
- [ ] Dockerfiles rodam como usuario nao-root
- [ ] Health checks configurados em todos os containers
- [ ] Variaveis de ambiente documentadas (ENVIRONMENT_VARIABLES.md)
- [ ] Backup do banco de staging testado e restaurado

## Staging

- [ ] Deploy em staging funciona
- [ ] Migrations rodam sem erro
- [ ] Seed cria admin
- [ ] Login funciona
- [ ] Criar campanha funciona
- [ ] Criar grupo funciona
- [ ] Importar contatos funciona
- [ ] Classificar contato funciona
- [ ] Dashboard mostra dados corretos
- [ ] Webhook Eduzz processa compra/reembolso
- [ ] Worker conecta e processa eventos (se WhatsApp Manager disponivel)
- [ ] Rate limiting funciona (429 apos limite)
- [ ] CORS configurado corretamente
- [ ] HTTPS habilitado no dominio

## Producao

- [ ] **BACKUP** do banco antes de qualquer alteracao
- [ ] Deploy em producao
- [ ] Migrations rodam sem erro
- [ ] Health checks verdes em api, worker, postgres, redis
- [ ] Login com credenciais de producao
- [ ] Dashboard carrega
- [ ] Criar campanha de teste (deletar depois)
- [ ] Monitorar logs por 30 minutos
- [ ] Verificar rate limiting ativo
- [ ] Verificar CORS restrito a dominio de producao

## Infraestrutura de producao (não provisionar nesta etapa)

- [ ] PostgreSQL, Redis, API, worker e web isolados de staging
- [ ] Domínios e HTTPS definitivos
- [ ] Secrets exclusivos no gerenciador do ambiente
- [ ] Backup automático, retenção e restore testados
- [ ] Monitoramento de liveness, readiness, filas e integrações
- [ ] Admin owner exclusivo, CORS e origens CSRF definitivas
- [ ] Rate limits revisados para a carga aprovada
- [ ] `WHATSAPP_OUTBOUND_ENABLED=false` como estado inicial em API e worker
- [ ] Credenciais de produção do Group Manager, sem reutilizar staging
- [ ] Credenciais Meta permanentes, webhook e WABA de produção

## Número comercial definitivo Meta (não registrar sem autorização)

- [ ] Número definido e sob controle do Meteórico
- [ ] Acesso ao método de verificação SMS/VOICE exigido no fluxo atual da Meta
- [ ] Business Portfolio, app e WABA definitivos confirmados
- [ ] Método oficial decidido: número novo, migração ou coexistência quando
      disponível e elegível no painel atual
- [ ] Número registrado e Phone Number ID obtido somente na janela aprovada
- [ ] System User com app/WABA atribuídos e token armazenado no secret manager
- [ ] `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_WABA_ID` e credencial
      atualizados em API/worker, sem hardcode
- [ ] Callback HTTPS e assinatura do campo `messages` verificados
- [ ] Templates revisados/aprovados e billing tratados em autorização separada
- [ ] Allowlist e kill switch mantidos durante validação controlada

## Campanha comercial futura

- [ ] Criar em `draft`; deploy não pode ativar campanha
- [ ] Revisar grupos, categorias, capacidades e invite links
- [ ] Revisar templates, tracking e janela de ativação
- [ ] Auditar filas e outbound safety
- [ ] Obter aprovação humana final antes de mudar para `active`

## Pos-Deploy

- [ ] Remover campanha de teste
- [ ] Configurar backup diario automatico
- [ ] Documentar credenciais em local seguro (nao no repo)
- [ ] Notificar equipe sobre disponibilidade
- [ ] Monitorar por 24h

## Criterios de Rollback

Fazer rollback imediato se:
- Health check nao fica verde em 5 minutos
- Login falha
- Dashboard retorna erro
- Worker nao conecta ao banco
- Erro 500 persistente nos logs

## Aprovacao Humana

**IMPORTANTE**: Nao fazer merge em main sem aprovacao humana explicita.

1. Criar PR de staging para main
2. Revisar changeset completo
3. Confirmar que staging esta estavel
4. Aprovar PR
5. Merge
6. Tag v1.0.0 apos validacao em producao
