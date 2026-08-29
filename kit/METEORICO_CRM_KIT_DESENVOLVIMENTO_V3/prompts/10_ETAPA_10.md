# Etapa 10 - 10 - Auditoria final, segurança e EasyPanel

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

```text
Esta é a etapa final. Leia todo o repositório, o README e o PROJECT_STATE. Não declare conclusão sem evidências.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 9
BRANCH DESTA ETAPA: phase/10-release

OBJETIVO:
Auditar, endurecer, testar, documentar e preparar a release para staging e produção no EasyPanel.

ESCOPO:
1. Revisão arquitetural.
2. Revisão de segurança e threat model.
3. Revisão de permissões e acesso por objeto.
4. Secret scan completo.
5. Dependency e container scan.
6. SAST quando disponível.
7. Testes unitários, integração, contrato e E2E.
8. Testes de concorrência, retry, idempotência e falhas externas.
9. Testes de carga nos endpoints críticos.
10. Teste real de backup e restauração em staging.
11. Política de retenção, anonimização e exclusão.
12. Runbooks de incidentes.
13. Observabilidade:
    - logs;
    - métricas;
    - health;
    - readiness;
    - filas;
    - atraso de integrações;
    - alertas.
14. Dockerfiles finais e imagens não root.
15. Migrations de release.
16. Configuração EasyPanel documentada para:
    - web;
    - api;
    - worker;
    - PostgreSQL;
    - Redis;
    - domínios;
    - health checks;
    - volumes;
    - backups;
    - variáveis;
    - staging e produção.
17. Rollback documentado.
18. Checklist de go-live.
19. Manual do administrador.
20. Manual de operação semanal da campanha.
21. Release notes.
22. PR final para staging e, após aprovação humana, para main.

VARIÁVEIS DE PRODUÇÃO:
Fornecer lista completa de nomes, finalidade, obrigatoriedade e como testar, sem valores reais.

DEPLOY:
- staging primeiro;
- smoke tests;
- migração;
- validação funcional;
- aprovação humana;
- produção;
- smoke tests pós-deploy;
- rollback imediato se critérios falharem.

NÃO FAZER:
- não inserir token no repositório;
- não imprimir segredos;
- não migrar produção sem backup;
- não apagar histórico;
- não ignorar testes quebrados;
- não liberar integração real sem rate limit e idempotência;
- não fazer merge em main sem aprovação humana explícita.

CENÁRIOS E2E OBRIGATÓRIOS:
1. Novo lead → grupo de novos → entrada confirmada.
2. Segunda campanha → grupo de reparticipantes.
3. Terceira campanha → diagnóstico.
4. Aluno → fluxo de aluno.
5. Clique repetido na mesma campanha → mesmo destino.
6. Grupo lotado → próximo grupo.
7. Evento duplicado → nenhuma duplicação.
8. API de grupos fora do ar → retoma pelo cursor.
9. IA fora do ar → fluxo fixo continua.
10. Eduzz fora do ar → estado aguardando, sem decisão silenciosa errada.
11. Opt-out → nenhuma mensagem adicional.
12. Compra e reembolso → dashboards corretos.
13. Usuário read_only tenta editar → bloqueado.
14. Importação maliciosa → rejeitada.
15. Código de atribuição adulterado → rejeitado.

CRITÉRIOS DE ACEITE FINAL:
- todos os testes passam;
- zero segredo no histórico Git;
- vulnerabilidades críticas resolvidas;
- backups e restauração comprovados;
- documentação operacional completa;
- staging estável;
- EasyPanel reproduzível;
- dashboards corretos;
- integrações observáveis;
- PROJECT_STATE.md marca release candidata;
- aprovação humana é solicitada antes do merge em main.

COMMITS E RELEASE:
- commit final sugerido: chore: harden and prepare meteorico crm release
- criar PR para staging;
- após aprovação e validação, PR separado staging → main;
- tag sugerida: v1.0.0 somente após produção validada.

SAÍDA FINAL:
- relatório de auditoria;
- resultados de cada suíte;
- cobertura;
- scans;
- teste de backup/restore;
- URLs de staging;
- checklist de variáveis;
- plano de rollback;
- riscos residuais;
- hashes dos commits;
- PRs;
- instruções exatas para aprovação humana e go-live.
```

---
