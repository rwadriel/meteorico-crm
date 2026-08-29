# Etapa 05 - 5 - Consumidor da API de grupos e reconciliação

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

```text
Execute somente a etapa 5. Leia o kit do WhatsApp Manager e não invente endpoints.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 4
BRANCH DESTA ETAPA: phase/05-group-events

OBJETIVO:
Integrar de forma robusta a API somente leitura do WhatsApp Manager para confirmar entradas, adições, saídas e remoções.

CONTRATO DISPONÍVEL:
- GET /api/integration/health
- GET /api/integration/events
- GET /api/integration/snapshots
- autenticação Bearer por ambiente
- cursor crescente
- event_id determinístico
- number pode ser nulo

ESCOPO:
1. Criar adapter WhatsAppManagerReadProvider.
2. Worker de polling com intervalo configurável.
3. Cursor persistido por integração/consumidor.
4. Paginação completa.
5. Idempotência por event_id.
6. Processamento transacional.
7. Mapeamento de groupId para grupo e campanha.
8. Upsert de contato por número ou identificador disponível.
9. Registro de entrada, saída e reentrada.
10. Uma participação por contato e campanha.
11. Incrementar contagem apenas na primeira entrada confirmada daquela campanha.
12. Snapshots para reconciliação, sem inventar datas históricas.
13. Tela de saúde da integração, atraso, cursor, último evento e erros.
14. Reprocessamento seguro de evento com falha.
15. Dead-letter ou fila de falhas.
16. Alertas operacionais básicos.

REGRAS:
- persistir cursor depois do processamento;
- se cair, reprocessar com idempotência;
- groupId desconhecido vai para fila de associação manual, não para campanha inferida;
- number nulo não deve quebrar processamento;
- nomes podem vir vazios;
- não usar isSaved como classificação;
- nenhuma mensagem privada é enviada por esta integração.

TESTES:
- contrato com fixtures reais anonimizadas;
- paginação;
- queda entre evento e cursor;
- evento duplicado;
- entrada/saída/reentrada;
- duas pessoas no mesmo evento;
- number nulo;
- groupId desconhecido;
- indisponibilidade e retry;
- reconciliação por snapshot;
- concorrência de workers;
- integração com Postgres e Redis.

CRITÉRIOS DE ACEITE:
- entradas reais podem ser refletidas sem duplicação;
- painel mostra saúde;
- atraso é observável;
- participação por campanha é correta;
- testes passam;
- documentação atualizada;
- commit e push.

Commit final sugerido: feat: ingest and reconcile whatsapp group events
```

---
