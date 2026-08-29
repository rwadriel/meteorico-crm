# WhatsApp Manager — Kit de Integração

Tudo que você precisa para consumir os dados do **WhatsApp Manager** em outro sistema: entradas e saídas de membros dos grupos, em tempo (quase) real, com a marca de quem já é seu contato (`isSaved`).

Este kit contém a **documentação completa** e um **CRM inicial funcional** que você roda e evolui.

## O que dá para fazer

O feed te entrega **todo movimento de todos os grupos**. Alguns usos:

- **CRM de leads** — cada número que entra vira um contato na sua base (tem exemplo pronto aqui).
- **Boas-vindas** — reagir a quem entra e ainda não é seu contato.
- **Recuperação** — agir sobre quem saiu/foi removido.
- **Analytics** — crescimento dos grupos, entradas/saídas por dia.
- **Sincronização** — espelhar a lista de membros de um grupo.

## Por onde começar

1. **[docs/01-inicio-rapido.md](docs/01-inicio-rapido.md)** — configurar o token e fazer seu primeiro request (5 minutos).
2. **[docs/02-referencia-api.md](docs/02-referencia-api.md)** — todos os endpoints, parâmetros e respostas.
3. **[docs/03-modelo-de-dados.md](docs/03-modelo-de-dados.md)** — o formato dos eventos e o que cada campo significa.
4. **[docs/04-casos-de-uso.md](docs/04-casos-de-uso.md)** — receitas prontas (CRM, boas-vindas, recuperação, analytics).
5. **[docs/05-boas-praticas.md](docs/05-boas-praticas.md)** — cursor, idempotência, cuidados que evitam dor de cabeça.

## O CRM pronto

Em **[exemplos/crm/](exemplos/crm/)** tem um CRM funcional (Node puro, sem dependências externas): consome o feed, monta uma base SQLite de contatos com dedup, e sobe um painel web simples para ver e exportar. É o ponto de partida do seu projeto.

```bash
cd exemplos/crm
cp .env.example .env      # coloque seu token e a URL
node index.js             # começa a coletar
node painel.js            # painel em http://localhost:4080
```

## Acesso rápido

| | |
|---|---|
| **Base URL** | `https://zapgrupos-whatsapp-manager.gq2dju.easypanel.host` |
| **Autenticação** | header `Authorization: Bearer <token>` |
| **Token** | variável `WHATSAPP_MANAGER_INTEGRATION_TOKEN` (definida no EasyPanel) |

> ⚠️ O token dá acesso aos contatos dos seus grupos. Trate como senha. Se vazar, gere outro no EasyPanel.
