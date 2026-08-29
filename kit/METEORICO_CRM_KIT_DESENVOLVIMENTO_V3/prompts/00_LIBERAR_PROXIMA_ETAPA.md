# Modelo para liberar a próxima etapa

Depois de revisar e aprovar uma etapa, use este modelo antes de colar o prompt seguinte.

```text
A ETAPA {{N}} está APROVADA.

Antes de qualquer alteração:
1. Leia `prompts/00_INSTRUCOES_FIXAS.md`.
2. Leia `docs/PROJECT_STATE.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` e os ADRs atuais.
3. Verifique que a branch/commit da Etapa {{N}} está presente no repositório.
4. Execute uma verificação rápida dos testes existentes para confirmar que o estado está íntegro.
5. Aguarde/execute exclusivamente o prompt `prompts/{{ARQUIVO_DA_PROXIMA_ETAPA}}` que será fornecido a seguir.
6. Não avance além da Etapa {{N+1}}.
7. Não reescreva arquitetura já aprovada sem apresentar problema, alternativas, impacto e pedir aprovação.
8. Não revele segredos e não faça commit de dados pessoais reais.
```
