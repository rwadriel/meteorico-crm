# CRM Meteórico

Painel protegido para importar contatos, excluir compradores e opt-outs e executar campanhas de follow-up pela WhatsApp Business Cloud API oficial da Meta.

## Operação semanal

1. Entre no painel.
2. Importe o CSV e confira a prévia.
3. Abra **Follow-up WhatsApp** e crie a campanha.
4. Execute **Modo Teste**.
5. Confira os elegíveis e inicie a campanha.
6. Acompanhe entrega, leitura, respostas, falhas e opt-outs.

O sistema não usa WhatsApp Web, Baileys, Evolution API ou qualquer automação não oficial.

## Desenvolvimento

```bash
pnpm install
pnpm db:generate
pnpm typecheck
pnpm test:ci
pnpm build
```

O deploy no EasyPanel usa [`docker-compose.easypanel.yml`](docker-compose.easypanel.yml). Segredos existem somente nas variáveis protegidas do ambiente.

Documentação operacional: [`docs/OPERACAO.md`](docs/OPERACAO.md). Integração Meta: [`docs/META-WHATSAPP.md`](docs/META-WHATSAPP.md).
