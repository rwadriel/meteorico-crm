# Etapa 07 - 7 - Motor de classificação e integrações de histórico/aluno

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

```text
Execute apenas a etapa 7. Leia os contratos reais da API de participações e da Eduzz, se já tiverem sido fornecidos. Não invente campos. Se ainda faltarem, mantenha adapters, mocks e contract tests marcados como aguardando fixture real.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 6
BRANCH DESTA ETAPA: phase/07-classification

OBJETIVO:
Implementar o motor determinístico que decide o fluxo do contato na campanha.

ESCOPO:
1. StudentStatusProvider.
2. ParticipationHistoryProvider.
3. Adapters reais apenas com documentação válida.
4. Cache controlado e timestamp da consulta.
5. Regras configuráveis com versão por campanha.
6. Resultado de classificação auditável, contendo fatos usados.
7. Precedência:
   - opt-out/bloqueado;
   - aluno;
   - participação já existente na campanha;
   - número de campanhas anteriores confirmadas;
   - fallback manual.
8. Alocação de grupo por segmento, prioridade e capacidade.
9. Reserva temporária opcional para evitar sobrealocação.
10. Reenvio do mesmo destino em contato repetido na campanha.
11. Estado “aguardando dados” quando integrações falharem.
12. Override manual auditado.
13. Simulador no painel: informar contato e campanha, visualizar decisão sem enviar mensagem.
14. Explicação da decisão para administradores, sem expor dados sensíveis.

REGRAS INICIAIS:
- aluno → aluno;
- 0 campanhas anteriores confirmadas → novo;
- 1 → reparticipante;
- >=2 → veterano/diagnóstico;
- já classificado na atual → manter;
- entrada e reentrada na mesma campanha contam uma vez.

TESTES:
- matriz completa de regras;
- conflitos entre fontes;
- API fora do ar;
- dado antigo;
- aluno com outro número quando houver e-mail confirmado;
- grupo lotado;
- concorrência na alocação;
- repetição na mesma campanha;
- override;
- simulação sem efeitos colaterais.

CRITÉRIOS DE ACEITE:
- decisão reproduzível e explicável;
- IA não participa da decisão;
- grupo correto é escolhido;
- falhas externas não causam classificação silenciosa errada;
- testes e docs aprovados;
- commit e push.

Commit final sugerido: feat: implement auditable lead classification engine
```

---
