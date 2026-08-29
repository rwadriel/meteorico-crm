# Arquitetura resumida

```text
Página/Anúncio
  -> Redirecionador de atribuição
  -> Conversa privada iniciada pelo lead
  -> Webhook de mensagens
  -> Motor determinístico de classificação
       -> aluno
       -> novo
       -> reparticipante
       -> veterano/diagnóstico
  -> Link do grupo da campanha
  -> API WhatsApp Manager confirma entrada/saída
  -> Banco global + dados da campanha
  -> Dashboard geral e por campanha
  -> Eduzz confirma compra/reembolso
```

## Componentes

- Web: painel administrativo responsivo.
- API: autenticação, CRUD, webhooks, relatórios e configuração.
- Worker: polling da API de grupos, filas, reconciliação e tarefas.
- PostgreSQL: fonte de verdade.
- Redis: fila, locks, rate limits e cache.
- Integrações desacopladas por adapters.
- IA: somente para dúvidas abertas e diagnóstico; nunca para regras críticas.

## Invariantes

- Um contato global por telefone normalizado quando disponível.
- Uma participação principal por contato e campanha.
- Eventos externos idempotentes.
- Configurações publicadas de campanhas antigas são imutáveis.
- Todos os eventos comerciais possuem `contact_id` e `campaign_id` quando aplicável.
