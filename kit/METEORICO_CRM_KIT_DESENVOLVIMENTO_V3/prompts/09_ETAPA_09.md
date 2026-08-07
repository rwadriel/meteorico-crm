# Etapa 09 - 9 - Dashboards, Eduzz, tráfego e relatórios

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

```text
Execute somente a etapa 9. Use documentação oficial e amostras reais anonimizadas para integrações. Não invente métricas ou atribuição.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 8
BRANCH DESTA ETAPA: phase/09-analytics

OBJETIVO:
Entregar dashboards globais e por campanha, integração de compras e visão de tráfego.

ESCOPO:
1. Projeções e agregações eficientes.
2. Dashboard geral.
3. Dashboard da campanha.
4. Dashboard do grupo.
5. Dashboard de origem/anúncio.
6. Linha do tempo do contato.
7. Comparação entre campanhas.
8. Filtros de período, campanha, segmento, grupo e origem.
9. Exportação CSV segura.
10. Integração Eduzz para aluno, compra, reembolso e cancelamento quando contrato disponível.
11. Webhook autenticado, idempotente e reprocessável.
12. Associação de compra ao contato e campanha com nível de confiança.
13. Importação opcional de métricas Meta quando documentação e credenciais estiverem disponíveis.
14. Métricas:
    - investimento;
    - impressões;
    - cliques;
    - CTR;
    - CPC;
    - CPM;
    - conversas;
    - links enviados;
    - entradas;
    - saídas;
    - compras;
    - CPL e custos por etapa;
    - conversões.
15. Dicionário de métricas visível no painel.
16. Freshness e última sincronização.
17. Indicar dados estimados, incompletos ou de baixa confiança.
18. Consultas performáticas e índices.
19. Paginação e limites.
20. Testes com volume representativo.

REGRAS:
- não misturar contato único com participação;
- toda métrica por campanha usa campaign_id;
- geral deve deduplicar quando a métrica for de contatos únicos;
- compra deve registrar fonte e confiança;
- reembolso deve refletir receita líquida sem apagar a compra;
- métricas antigas não mudam quando templates atuais forem editados;
- dashboards devem mostrar timezone.

TESTES:
- cálculos de métricas;
- contato em várias campanhas;
- compra e reembolso;
- atraso de sincronização;
- atribuição incerta;
- filtros;
- exportação;
- performance;
- autorização de analista/read_only;
- E2E mobile e desktop.

CRITÉRIOS DE ACEITE:
- visão geral e por campanha coerentes;
- dados rastreáveis até eventos;
- métricas definidas;
- performance aceitável;
- integrações falham de forma visível;
- testes e docs aprovados;
- commit e push.

Commit final sugerido: feat: deliver campaign analytics and revenue attribution
```

---
