# Segredos, tokens e dados pessoais

## Nunca coloque no prompt ou repositório

- tokens do GitHub;
- chaves xAI/Grok;
- tokens do WhatsApp Manager;
- tokens do provedor de mensagens;
- credenciais Eduzz/Meta;
- DATABASE_URL de produção;
- senhas e cookies;
- listas reais de contatos.

## Como entregar acesso à IA

Use uma integração GitHub instalada ou uma variável secreta do ambiente, por exemplo `GITHUB_TOKEN`. O agente deve apenas verificar se consegue usar o acesso; ele nunca deve imprimir o valor.

## Token temporário do GitHub

Use um token de acesso refinado, limitado ao repositório do projeto, com expiração curta e somente as permissões necessárias. Para alterar código por Git, normalmente é necessário conteúdo do repositório em leitura e escrita. Permissões administrativas só devem ser dadas quando uma etapa realmente precisar alterar configurações do repositório.

## xAI/Grok

Use uma chave separada por ambiente, com acesso limitado ao endpoint/modelo necessário, limites de uso e expiração quando disponível. A chave real entra apenas no secret `XAI_API_KEY`.

## Logs e banco

- Mascarar telefone e e-mail nos logs.
- Não registrar corpos completos de webhooks sem necessidade.
- Criptografar segredos armazenados.
- Auditar alterações administrativas.
- Definir retenção e exclusão de dados.
