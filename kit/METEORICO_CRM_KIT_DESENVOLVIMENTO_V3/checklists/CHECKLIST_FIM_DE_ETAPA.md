# Validação obrigatória ao final de cada etapa

Preencha este checklist antes de executar o próximo prompt.

- [ ] A branch tem o nome previsto no prompt.
- [ ] A IA leu `docs/PROJECT_STATE.md`.
- [ ] Os arquivos alterados pertencem ao escopo da etapa.
- [ ] Não existem chaves, tokens, senhas ou dados reais no repositório.
- [ ] `pnpm install --frozen-lockfile` ou equivalente concluiu.
- [ ] Lint passou.
- [ ] Typecheck passou.
- [ ] Testes unitários passaram.
- [ ] Testes de integração da etapa passaram.
- [ ] Build passou.
- [ ] Migrations foram testadas quando aplicável.
- [ ] Docker/containers foram testados quando aplicável.
- [ ] Documentação foi atualizada.
- [ ] `docs/PROJECT_STATE.md` registra o estado real.
- [ ] A IA forneceu hash do commit e URL da branch/PR.
- [ ] O proprietário revisou a interface quando houver alteração visual.
- [ ] Não há bloqueio crítico pendente.
