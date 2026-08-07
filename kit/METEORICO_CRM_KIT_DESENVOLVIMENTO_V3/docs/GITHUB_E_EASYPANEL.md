# Guia resumido - GitHub e EasyPanel

## Fluxo correto

1. A IA trabalha em uma branch `phase/...`.
2. A IA executa todos os testes.
3. A IA faz commit e push.
4. O proprietário revisa e aprova.
5. A branch aprovada é integrada em `staging`.
6. O EasyPanel constrói a aplicação a partir do repositório/Dockerfile.
7. Staging recebe migrations controladas e smoke tests.
8. Produção só é liberada na Etapa 10.

## Segredos

Configure os valores reais diretamente no EasyPanel ou em um gerenciador de segredos. Não coloque valores em `.env.example`, README, prompts, commits ou screenshots.

## Serviços esperados

- `web`: frontend administrativo;
- `api`: API e webhooks;
- `worker`: consumo de eventos, filas e tarefas;
- PostgreSQL;
- Redis;
- opcionalmente proxy/domínios gerenciados pelo EasyPanel.

## Ordem segura de deploy

1. Backup do banco.
2. Build imutável.
3. Migration compatível e reversível.
4. Deploy de API/worker.
5. Deploy da web.
6. Health checks.
7. Smoke tests.
8. Liberação gradual.
9. Monitoramento de erros.
10. Rollback se os critérios falharem.
