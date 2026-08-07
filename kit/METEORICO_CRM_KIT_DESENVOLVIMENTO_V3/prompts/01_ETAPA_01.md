# Etapa 01 - 1 - Fundação, especificação e repositório

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

Copie o bloco abaixo para a IA de programação. Substitua apenas os placeholders não secretos.

```text
Você atuará como arquiteto de software, engenheiro full-stack sênior, engenheiro de segurança, QA e DevOps deste projeto. Trabalhe diretamente no repositório indicado, em uma branch exclusiva. Não avance além desta etapa.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: {{DEFAULT_BRANCH}}
BRANCH DESTA ETAPA: phase/01-foundation
NOME DO PROJETO: Meteórico CRM
FUSO: America/Belem

AUTENTICAÇÃO DO GITHUB:
O ambiente do agente poderá possuir a variável secreta GITHUB_TOKEN ou uma integração GitHub já instalada. Nunca solicite, mostre, registre ou grave o valor do token. Se não houver autenticação suficiente para clonar ou enviar commits, pare e informe apenas a permissão ausente.

EASYPANEL:
O EasyPanel será conectado ao repositório. Nesta etapa, prepare a aplicação para staging, mas não faça deploy em produção. O fluxo é commit e push no GitHub; o EasyPanel fará build/deploy da branch de staging quando configurado. Não solicite token do EasyPanel se o deploy puder ser conectado manualmente.

CONTEXTO DO PRODUTO:
Leia integralmente o `README.md` na raiz e `docs/README_METEORICO_EXECUCAO.md`. O produto é um CRM de lançamentos semanais. Não haverá formulário obrigatório antes do WhatsApp. O lead inicia uma conversa, o sistema identifica campanha e origem, consulta histórico, classifica, envia o destino correto e confirma entrada por uma API de grupos somente leitura. Tudo deve ter visão global e por campanha.

MATERIAIS:
- kit do WhatsApp Manager fornecido no projeto ou como arquivo anexo;
- referência visual de dashboard escuro com destaque verde-limão;
- integrações ainda não documentadas devem ser tratadas por interfaces e mocks, nunca inventadas.

OBJETIVO EXCLUSIVO DA ETAPA 1:
1. Inspecionar o repositório e registrar o estado inicial.
2. Criar ou consolidar a especificação funcional.
3. Criar a arquitetura do sistema e ADRs iniciais.
4. Inicializar o monorepo TypeScript.
5. Criar aplicações mínimas web, api e worker.
6. Criar packages domain, database, shared e ui.
7. Configurar lint, format, typecheck, testes, build e CI.
8. Criar Dockerfiles multi-stage e docker-compose de desenvolvimento.
9. Criar endpoint /health e uma tela inicial de status.
10. Criar documentação base e PROJECT_STATE.md.
11. Garantir que a fundação rode sem segredos reais.
12. Fazer commit e push da branch da etapa.

STACK DE REFERÊNCIA:
- TypeScript estrito;
- React + Vite no frontend;
- Fastify no backend;
- processo worker separado;
- PostgreSQL;
- Redis;
- Prisma;
- Zod;
- Pino;
- Vitest;
- Playwright preparado;
- pnpm workspace.

Você pode ajustar versões para versões estáveis e compatíveis, sempre fixadas no lockfile. Não troque a arquitetura sem ADR.

DOCUMENTOS OBRIGATÓRIOS:
- docs/PROJECT_BRIEF.md
- docs/ARCHITECTURE.md
- docs/DATA_MODEL.md com modelo conceitual inicial
- docs/SECURITY.md com threat model inicial
- docs/INTEGRATIONS.md
- docs/TEST_STRATEGY.md
- docs/DEPLOYMENT.md
- docs/PROJECT_STATE.md
- docs/adr/0001-monorepo-and-runtime.md
- docs/adr/0002-event-driven-campaign-model.md

REQUISITOS DA FUNDAÇÃO:
- nenhum segredo no código;
- .env.example apenas com nomes e valores fictícios;
- validação de ambiente no boot;
- logs estruturados com redaction;
- erros padronizados;
- IDs UUID ou equivalente seguro;
- datas armazenadas em UTC e exibidas no fuso da campanha;
- módulos desacoplados;
- domínio sem dependência de framework;
- OpenAPI preparado;
- health check da API, web e worker;
- CI executando install, lint, typecheck, test e build;
- secret scanning e dependency scanning configurados sem bloquear por falsos positivos não analisados;
- README principal com comandos locais.

NÃO IMPLEMENTAR AINDA:
- autenticação completa;
- banco de produção;
- regras finais de classificação;
- integração real com WhatsApp privado;
- integração real com Eduzz, Meta ou Grok;
- dashboards finais;
- editor de fluxo;
- deploy de produção.

TESTES OBRIGATÓRIOS:
- instalação limpa pelo lockfile;
- lint;
- typecheck;
- testes unitários mínimos da fundação;
- build de todas as aplicações;
- docker compose config;
- subida local dos containers quando o ambiente permitir;
- health check automatizado.

CRITÉRIOS DE ACEITE:
- monorepo executa localmente;
- nenhum segredo detectado;
- CI válido;
- containers constroem;
- /health responde;
- tela inicial abre;
- documentos explicam claramente o produto;
- PROJECT_STATE.md declara ETAPA 1 CONCLUÍDA e ETAPA 2 NÃO INICIADA;
- nenhum item das etapas seguintes foi implementado de forma improvisada.

FLUXO GIT:
1. Atualize a branch base.
2. Crie phase/01-foundation.
3. Faça commits pequenos e claros.
4. Execute todos os testes.
5. Faça commit final: feat: bootstrap meteorico crm foundation
6. Faça push da branch.
7. Não faça merge automático em main.

SAÍDA FINAL OBRIGATÓRIA:
- resumo objetivo;
- árvore principal criada;
- decisões e ADRs;
- comandos executados;
- resultados dos testes;
- riscos e pendências;
- hash do commit;
- URL da branch ou PR, se disponível;
- confirmação explícita de que nenhum segredo foi incluído.

Se alguma condição não puder ser cumprida, não finja sucesso. Pare e relate o bloqueio exato.
```

---
