# Etapa 02 - 2 - Banco, campanhas, autenticação e auditoria

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

```text
Atue no mesmo projeto Meteórico CRM. Leia `README.md`, `docs/README_METEORICO_EXECUCAO.md` e todos os documentos em `/docs` e principalmente docs/PROJECT_STATE.md. Não avance além da etapa 2.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: phase/01-foundation ou a branch resultante aprovada
BRANCH DESTA ETAPA: phase/02-data-security

Use autenticação do GitHub apenas por integração ou variável secreta. Nunca revele tokens.

OBJETIVO DA ETAPA 2:
Implementar a fundação persistente, segurança administrativa e o modelo global + campanha.

ESCOPO:
1. Finalizar schema Prisma e migrations para:
   - usuários administrativos, papéis e permissões;
   - contatos globais;
   - campanhas e versões;
   - participações por campanha;
   - grupos;
   - eventos e cursores de integração;
   - atribuições;
   - conversas e mensagens;
   - templates e versões;
   - integrações;
   - importações;
   - auditoria.
2. Criar constraints críticas:
   - telefone normalizado único quando disponível;
   - contact_id + campaign_id único;
   - event_id de integração único;
   - código de campanha único;
   - groupId externo único quando ativo.
3. Criar autenticação segura de administrador.
4. Implementar RBAC inicial: owner, admin, operator, analyst, read_only.
5. Implementar sessões seguras, rate limit, proteção de login e auditoria.
6. Criar seed apenas com dados fictícios e administrador de desenvolvimento definido por variáveis.
7. Criar repositórios e serviços de domínio, sem lógica de interface acoplada.
8. Criar testes de migration, constraints, auth e autorização por recurso.
9. Atualizar documentação e threat model.

REGRAS DE SEGURANÇA:
- Argon2id;
- cookie HttpOnly/Secure/SameSite;
- CSRF quando necessário;
- CORS por allowlist;
- sessões revogáveis;
- rotação de sessão após login;
- respostas de login sem enumeração de usuário;
- logs sem senha, token ou telefone completo;
- auditoria para login, logout, alteração de permissão e configuração;
- owner não pode ser removido sem procedimento seguro;
- nenhuma rota confia apenas no ID recebido.

REGRAS DE DADOS:
- UTC no banco;
- telefone normalizado E.164 sem sinal, quando possível;
- preservar identificador LID quando não houver número;
- estado atual e eventos imutáveis separados;
- soft delete apenas onde fizer sentido;
- campaigns nunca apagadas quando houver dados comerciais;
- versões publicadas imutáveis.

NÃO IMPLEMENTAR:
- integração real externa;
- chatbot;
- dashboard final;
- Meta Ads;
- deploy de produção.

TESTES:
- unitários de normalização e regras de invariantes;
- integração com PostgreSQL real em container;
- migrations do zero;
- rollback testado quando suportado;
- autenticação e autorização;
- tentativas de acesso horizontal e vertical;
- rate limiting;
- auditoria;
- lint, typecheck, build.

CRITÉRIOS DE ACEITE:
- banco sobe do zero;
- schema representa contato global e participações por campanha;
- login seguro funcional por API;
- RBAC testado;
- auditoria funcional;
- documentação atualizada;
- PROJECT_STATE.md marca etapa 2 concluída;
- commit e push realizados sem segredos.

Commit final sugerido: feat: add secure campaign-centric data foundation
```

---
