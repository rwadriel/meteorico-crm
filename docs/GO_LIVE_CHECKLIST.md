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
