# Etapa 06 - 6 - Conversa privada, redirecionador e atribuição

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

```text
Execute apenas a etapa 6. Não implemente contra API privada inventada. Se o provedor real ainda não tiver documentação, implemente interface, mock, sandbox e contratos pendentes explícitos.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 5
BRANCH DESTA ETAPA: phase/06-messaging-attribution

OBJETIVO:
Criar a infraestrutura de conversa privada iniciada pelo lead, o redirecionador rastreável e a atribuição por campanha.

ESCOPO:
1. Interface MessagingProvider com capacidades declaradas:
   - receber webhook;
   - enviar texto;
   - enviar link;
   - botões interativos quando suportados;
   - fallback numerado;
   - status de entrega;
   - janela de atendimento;
   - handoff.
2. Verificação de webhook e idempotência.
3. Registro de conversa e mensagem com campaign_id.
4. Endpoint de redirecionamento /r/:campaignSlug.
5. Captura de UTM, fbclid e IDs permitidos.
6. Código curto aleatório, expiração e uso único ou controlado.
7. Montagem da mensagem pronta.
8. Associação do código quando a conversa chegar.
9. Suporte a referral do provedor quando existir.
10. Nível de confiança da atribuição.
11. Proteção contra abuso, scraping e open redirect.
12. Painel para testar o link e visualizar atribuições.
13. Consentimento, opt-out e bloqueio de contato.
14. Filas, retries e status de envio.

REGRAS:
- sem dados pessoais no código curto;
- links de destino somente por allowlist;
- código assinado ou armazenado com alta entropia;
- não confiar em campaignSlug enviado pelo cliente sem validar;
- mensagem recebida repetida não duplica participação;
- telefone deve ser normalizado;
- nenhuma classificação comercial ainda deve depender de IA.

TESTES:
- clique → código → redirect → webhook → atribuição;
- código expirado;
- código adulterado;
- open redirect;
- webhook duplicado;
- assinatura inválida;
- provider indisponível;
- fallback de botão;
- opt-out;
- atribuição alta, média e baixa;
- carga básica do redirecionador.

CRITÉRIOS DE ACEITE:
- conversa iniciada pode ser ligada à campanha;
- origem é persistida;
- provider pode ser substituído;
- nenhum segredo ou dado pessoal vaza na URL;
- documentação e testes aprovados;
- commit e push.

Commit final sugerido: feat: add messaging gateway and campaign attribution
```

---
