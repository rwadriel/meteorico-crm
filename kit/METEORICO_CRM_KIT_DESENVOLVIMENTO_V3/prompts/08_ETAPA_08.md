# Etapa 08 - 8 - Mensagens, botões, fluxos e Grok

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

```text
Execute somente a etapa 8. A chave xAI deve existir apenas em variável secreta XAI_API_KEY. Nunca solicite, mostre ou persista seu valor em texto aberto.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 7
BRANCH DESTA ETAPA: phase/08-flows-ai

OBJETIVO:
Entregar um editor seguro de mensagens, botões e fluxos comerciais, incluindo diagnóstico por IA para veteranos.

ESCOPO:
1. Templates globais e cópias por campanha.
2. Rascunho, preview, teste e publicação.
3. Versões publicadas imutáveis.
4. Variáveis permitidas, validadas e documentadas.
5. Editor de botões e ações.
6. Fallback numerado.
7. Construtor de fluxo controlado:
   - gatilho;
   - condição permitida;
   - mensagem;
   - botões;
   - próxima etapa;
   - handoff.
8. Não permitir código arbitrário ou expressões não seguras.
9. AIProvider abstrato e adapter xAI/Grok.
10. Base de conhecimento editável.
11. Prompt do negócio versionado por campanha.
12. Limites de tokens, custo, tempo e tamanho.
13. Respostas fundamentadas somente na base configurada.
14. Proibição de promessas de monetização garantida.
15. Diagnóstico para terceira participação ou mais.
16. Classificação de objeção como sugestão da IA, confirmada por regra ou usuário.
17. Transferência humana.
18. Modo sem IA e fallback fixo.
19. Tela de playground sem usar contatos reais.
20. Métricas de uso e custo sem expor conteúdo sensível desnecessário.

A IA NÃO PODE:
- decidir aluno;
- alterar número de participações;
- escolher grupo fora dos destinos autorizados;
- inventar preço, garantia ou resultado;
- modificar links;
- executar ferramentas não allowlisted;
- responder fora do escopo indefinidamente.

SEGURANÇA DE PROMPT:
- separar instruções de sistema, negócio e mensagem do usuário;
- tratar conteúdo do usuário como não confiável;
- impedir prompt injection de alterar regras;
- limitar ferramentas;
- validar saída estruturada;
- registrar versão do prompt usada;
- não enviar dados desnecessários ao provedor.

TESTES:
- renderização de variáveis;
- variável desconhecida;
- versão e rollback;
- botões e fallback;
- loops de fluxo;
- prompt injection;
- indisponibilidade da IA;
- limite de custo;
- resposta proibida;
- handoff;
- diagnóstico completo;
- E2E no sandbox.

CRITÉRIOS DE ACEITE:
- mensagens e botões editáveis sem deploy;
- publicação segura;
- IA substituível;
- fluxo principal funciona sem IA;
- diagnóstico é útil e controlado;
- testes e documentação aprovados;
- commit e push.

Commit final sugerido: feat: add versioned flows and guarded ai diagnostics
```

---
