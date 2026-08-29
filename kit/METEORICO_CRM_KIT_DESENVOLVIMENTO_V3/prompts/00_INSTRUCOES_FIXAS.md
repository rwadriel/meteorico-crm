# Instruções fixas para todas as etapas

Estas regras acompanham os 10 prompts.

1. Trabalhe somente na etapa solicitada.
2. Leia `README.md`, `docs/PROJECT_STATE.md` e os ADRs antes de alterar código.
3. Não invente contratos de APIs ainda não documentadas. Use interfaces, mocks e testes de contrato.
4. Nunca solicite nem exiba tokens, chaves ou senhas no chat, logs, commits ou relatórios.
5. Use branch exclusiva por etapa. Não faça merge automático em `main`.
6. Execute instalação limpa, lint, typecheck, testes, build e verificações específicas da etapa.
7. Não marque como concluído algo que não foi executado.
8. Atualize `docs/PROJECT_STATE.md` com o estado real, pendências e próximo passo.
9. Faça commits pequenos; o commit final só ocorre após todos os testes passarem.
10. Ao final, entregue: resumo, arquivos alterados, comandos, resultados, riscos, hash do commit e URL da branch/PR.
11. Se houver bloqueio, pare e descreva exatamente o dado ou acesso que falta.
12. Não faça deploy de produção antes da Etapa 10.
