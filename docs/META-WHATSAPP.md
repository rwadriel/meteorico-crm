# Meta / WhatsApp Business Cloud API

## Integração oficial

O CRM envia somente templates aprovados em `pt_BR` pela Graph API oficial. O endpoint público do webhook é:

```text
https://<dominio-do-crm>/api/webhooks/whatsapp/meta
```

O `GET` valida o challenge com `META_WHATSAPP_VERIFY_TOKEN`. O `POST` valida `X-Hub-Signature-256` com `META_APP_SECRET` antes de persistir mensagens ou status.

## Templates

O CRM gerencia templates pelo endpoint oficial `/{WABA_ID}/message_templates`:

- criação com nome técnico, idioma, categoria, corpo, rodapé e exemplos;
- sincronização de status, categoria final, qualidade e motivo de rejeição;
- atualização por webhook quando a conta estiver inscrita em `message_template_status_update` e `template_category_update`;
- liberação para campanhas somente quando o status for `APPROVED`.

Os textos não usam automaticamente o nome importado. A categoria deve ser a classificação vigente retornada pela Meta; a sugestão local serve apenas como alerta e não substitui a revisão oficial.

## Coexistence

O número atual só pode ser conectado se o fluxo oficial da conta oferecer Coexistence/Embedded Signup para WhatsApp Business App. Não remover o número do aplicativo, não excluir WABA e não executar migração irreversível para contornar indisponibilidade.

Depois do onboarding, valide `is_on_biz_app` e `platform_type` na versão vigente da Graph API. Enquanto a elegibilidade não estiver confirmada, mantenha `WHATSAPP_OUTBOUND_ENABLED=false` e use o número de teste oficial da Meta.

## Segredos necessários

```text
META_WHATSAPP_ACCESS_TOKEN
META_WHATSAPP_PHONE_NUMBER_ID
META_WHATSAPP_WABA_ID
META_WHATSAPP_VERIFY_TOKEN
META_APP_SECRET
```

O token de produção deve pertencer ao mecanismo oficial indicado pela Meta para a conta, com permissões mínimas. Tokens temporários de desenvolvimento não devem permanecer em produção.

## Teste antes de produção

1. Configure um único destinatário autorizado.
2. Mantenha o restante da base fora do teste.
3. Envie um template aprovado.
4. Confirme `sent`, `delivered` e `read` no webhook.
5. Responda ao número e confirme a resposta no painel.
6. Responda `SAIR` e confirme o opt-out.
7. Só então habilite a operação real pelo painel.
