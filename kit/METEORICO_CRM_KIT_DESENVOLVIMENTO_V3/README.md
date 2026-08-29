# Meteórico CRM — Plano de Desenvolvimento em 10 Etapas

> Documento operacional para construir, testar e publicar um sistema de captação, classificação, acompanhamento e análise de leads de lançamentos semanais do Meteórico.
>
> Este arquivo foi escrito para ser colocado na raiz do repositório e usado como fonte de verdade por uma IA de programação. O desenvolvimento deve acontecer em etapas pequenas, auditáveis e testadas. Nenhuma etapa deve ser pulada.

---

## 1. Objetivo do sistema

Construir um CRM de lançamentos semanais capaz de:

1. Receber uma conversa iniciada pelo próprio lead no WhatsApp, sem formulário obrigatório.
2. Identificar a campanha, a origem do tráfego e o histórico daquele contato.
3. Consultar se ele já é aluno e quantas campanhas anteriores realmente participou.
4. Aplicar regras fixas de classificação:
   - primeira participação: grupo de novos;
   - segunda participação: grupo de reparticipantes;
   - terceira participação ou mais: diagnóstico pelo chatbot;
   - aluno: fluxo de aluno/suporte;
   - contato repetido na mesma campanha: manter o mesmo destino.
5. Distribuir links de grupos configurados no painel, respeitando campanha, segmento, prioridade e limite.
6. Confirmar entrada, saída e reentrada nos grupos usando a API existente do WhatsApp Manager.
7. Permitir edição de campanhas, grupos, mensagens, botões, regras comerciais, respostas, aparência e configurações da IA pelo painel.
8. Registrar dados globais e, ao mesmo tempo, manter todos os eventos comerciais ligados à campanha correta.
9. Mostrar dashboards gerais, por campanha, por grupo, por origem, por anúncio e por etapa do funil.
10. Integrar futuramente ou quando a documentação estiver disponível:
    - provedor oficial de mensagens privadas do WhatsApp;
    - API de participações já existente;
    - Eduzz;
    - xAI/Grok;
    - Meta Marketing API e Conversions API.
11. Ser seguro, testável, versionado, observável e implantável no EasyPanel.

---

## 2. Princípio estrutural obrigatório

A pessoa existe uma única vez como **contato global**, mas pode participar de várias campanhas.

```text
Contato global
└── Participação na campanha 41
└── Participação na campanha 42
└── Participação na campanha 45
```

Isso significa:

- um telefone normalizado representa um contato global;
- cada campanha possui uma participação única por contato;
- mensagens, classificações, grupos, origem, eventos, diagnósticos e compras devem apontar para `campaign_id`;
- uma entrada, saída e reentrada no mesmo grupo e na mesma campanha não criam uma nova participação;
- a contagem de participação considera campanhas distintas com entrada confirmada;
- receber um link não é o mesmo que participar;
- clicar várias vezes no anúncio da mesma campanha não aumenta a contagem;
- dados gerais devem ser calculados a partir dos dados das campanhas, sem duplicar contatos.

Nenhum evento comercial deve existir sem `contact_id` e, quando aplicável, `campaign_id`.

---

## 3. Fluxo de negócio esperado

```text
ANÚNCIO OU PÁGINA
        ↓
Botão “Quero participar”
        ↓
Redirecionador registra origem e cria código curto
        ↓
WhatsApp abre com mensagem pronta
        ↓
Lead toca em Enviar
        ↓
Webhook recebe a conversa privada
        ↓
Sistema identifica contato e campanha
        ↓
Consulta histórico, aluno e participações
        ↓
Aplica regras determinísticas
        ↓
Envia mensagem e destino corretos
        ↓
Lead entra no grupo
        ↓
WhatsApp Manager confirma entrada
        ↓
Participação da campanha é confirmada
        ↓
Dashboard e linha do tempo são atualizados
        ↓
Compra futura é ligada ao contato e à campanha
```

Mensagem inicial sugerida:

> Olá! Quero aprender a criar e monetizar um canal de música com IA no YouTube.

O redirecionador poderá acrescentar um código discreto e não sensível:

> Olá! Quero aprender a criar e monetizar um canal de música com IA no YouTube. `#A8K4P`

O código não deve conter telefone, e-mail, CPF ou qualquer dado pessoal. Ele apenas referencia um registro interno de atribuição com expiração.

---

## 4. Regras de classificação iniciais

As regras devem ser configuráveis no painel, mas executadas por um motor determinístico. A IA nunca decide se alguém é aluno, quantas vezes participou ou qual grupo recebe.

```text
SE aluno = verdadeiro
    → fluxo de aluno

SENÃO SE já existe participação na campanha atual
    → manter classificação e destino já atribuídos

SENÃO SE campanhas anteriores confirmadas = 0
    → segmento NOVO
    → grupo de novos

SENÃO SE campanhas anteriores confirmadas = 1
    → segmento REPARTICIPANTE
    → grupo de reparticipantes

SENÃO SE campanhas anteriores confirmadas >= 2
    → segmento VETERANO
    → diagnóstico pelo chatbot
```

A contagem deve considerar somente campanhas distintas em que houve entrada confirmada por evento `entrou` ou `adicionado`, ou por uma importação histórica explicitamente marcada como confirmada.

### Terceira participação ou mais

O chatbot deverá entender a necessidade atual, por exemplo:

- preço fora do momento;
- falta de tempo;
- dúvida sobre funcionamento;
- falta de confiança;
- já conhece a preparação e quer apenas novidades;
- quer atendimento humano;
- quer entrar novamente no grupo reduzido.

O destino final desse diagnóstico deve ser editável no painel.

---

## 5. Campanhas semanais

O negócio abre o carrinho às quartas-feiras. O painel deve permitir:

- criar campanha manualmente;
- duplicar a campanha anterior;
- incrementar o número da edição;
- sugerir datas deslocadas em sete dias;
- revisar antes de ativar;
- configurar fuso horário;
- manter uma campanha ativa e outras em rascunho, encerradas ou arquivadas;
- bloquear ativação quando campos obrigatórios estiverem incompletos;
- preservar versões históricas de mensagens, regras e configurações.

Exemplo:

```text
Campanha 47 — encerrada
Campanha 48 — ativa
Campanha 49 — rascunho
```

Ao duplicar uma campanha:

- copiar mensagens, botões, regras e configurações como rascunho;
- avançar datas em sete dias;
- limpar IDs e links dos grupos que precisam ser recriados;
- não copiar métricas, participações, eventos ou vendas;
- exigir revisão antes de publicar.

---

## 6. Grupos por campanha

Cada campanha poderá ter vários grupos:

```text
Meteórico 48
├── Novos T1
├── Novos T2
├── Novos T3
├── Reparticipantes R1
└── Veteranos V1, se configurado
```

Cada grupo deve possuir:

- `campaign_id`;
- segmento;
- nome interno;
- nome exibido;
- `groupId` do WhatsApp Manager;
- link de convite;
- limite desejado;
- prioridade de distribuição;
- status ativo/inativo/lotado/arquivado;
- quantidade atual estimada;
- quantidade de links enviados;
- entradas confirmadas;
- saídas;
- data da última sincronização.

O `groupId` é a identidade estável. O nome do grupo pode mudar e não deve ser usado como chave.

Quando um grupo atingir o limite configurado, o motor deve selecionar o próximo grupo ativo do mesmo segmento. Se não houver grupo disponível, usar uma regra de fallback configurável: lista de espera, diagnóstico, mensagem de indisponibilidade ou atendimento humano.

---

## 7. API do WhatsApp Manager já disponível

O kit fornecido é uma integração somente leitura. Ele não envia mensagens privadas. Sua função no novo sistema é confirmar movimentos dos grupos.

Contratos principais:

```text
GET /api/integration/health
GET /api/integration/events
GET /api/integration/snapshots
```

Requisitos obrigatórios do consumidor:

- autenticação por `Authorization: Bearer ...`;
- URL e token apenas em variáveis de ambiente;
- polling configurável, inicialmente entre 5 e 15 segundos;
- paginação até `hasMore = false` antes de aguardar o próximo intervalo;
- persistência do cursor somente depois de processar a página com sucesso;
- deduplicação por `event_id`;
- transação de banco para evento, participação e cursor;
- tratamento de `number = null`;
- registro do payload bruto com dados sensíveis minimizados ou protegidos;
- uso de `groupId` para relacionar o evento a um grupo da campanha;
- alertas de atraso quando `lastSeq - cursor` crescer acima do limite;
- reconciliação periódica por snapshots;
- tolerância a indisponibilidade da origem;
- nunca assumir data de entrada a partir de `updatedAt` do snapshot.

Eventos relevantes:

```text
entrou
adicionado
saiu
removido
baseline
grupo_criado
alteracao
```

Para participação, usar `entrou` e `adicionado`. Para abandono, usar `saiu` e `removido`.

O campo `isSaved` não será a fonte de verdade da classificação. O banco local será a fonte de verdade.

---

## 8. Rastreamento de origem

O sistema deve suportar duas rotas de atribuição.

### 8.1 Página ou anúncio que passa por um redirecionador próprio

Exemplo:

```text
https://seu-dominio.com/r/meteorico-048?utm_source=meta&utm_campaign=...
```

O redirecionador deve:

1. validar e normalizar parâmetros;
2. registrar o clique;
3. criar um código curto aleatório e com expiração;
4. associar o código à campanha ativa e aos metadados do tráfego;
5. montar a mensagem pronta do WhatsApp;
6. responder com redirecionamento HTTP imediato;
7. não expor dados pessoais no código;
8. limitar abuso e robôs;
9. registrar `fbclid`, UTM e IDs quando disponíveis.

### 8.2 Anúncio de clique direto para WhatsApp

Quando o provedor retornar metadados de referência, armazenar:

- origem;
- campanha da Meta;
- conjunto;
- anúncio;
- criativo;
- posicionamento;
- identificadores de referência;
- nível de confiança da atribuição.

### Nível de confiança

```text
alta   → código próprio válido e consumido pela conversa
média  → referência do provedor/Meta
baixa  → campanha inferida por fallback
```

Nunca apresentar uma atribuição de baixa confiança como certeza.

---

## 9. Dados globais e por campanha

### Contato global

Deve conter dados duráveis da pessoa:

- telefone normalizado;
- nome;
- e-mail quando conhecido;
- primeiro contato global;
- último contato global;
- aluno atual;
- produtos;
- total de campanhas confirmadas;
- consentimentos e preferências;
- estado de bloqueio/opt-out;
- tags globais;
- origem inicial e origem mais recente.

### Participação na campanha

Deve conter o estado daquela pessoa naquela edição:

- `contact_id`;
- `campaign_id`;
- primeiro e último contato na campanha;
- quantidade de participações anteriores no momento da classificação;
- segmento;
- classificação;
- grupo indicado;
- link enviado e data;
- entrada confirmada e data;
- saída e data;
- motivo do diagnóstico;
- atendimento humano;
- compra, reembolso e cancelamento;
- origem e atribuição;
- estado atual.

Deve existir uma restrição única para `contact_id + campaign_id`.

---

## 10. Dashboard

A referência visual é um painel escuro, profissional, com menu lateral, cartões em cinza grafite, destaque verde-limão, gráficos limpos e boa adaptação para celular. A referência é inspiração, não deve ser copiada literalmente.

### Tela geral

Indicadores sugeridos:

- contatos únicos;
- participações totais;
- campanhas realizadas;
- novos;
- reparticipantes;
- veteranos;
- alunos identificados;
- links enviados;
- entradas confirmadas;
- taxa de entrada;
- saídas;
- compras;
- conversão geral;
- investimento total;
- custo por conversa;
- custo por entrada;
- custo por compra.

### Tela da campanha

Indicadores sugeridos:

- conversas iniciadas;
- novos;
- reparticipantes;
- veteranos;
- alunos;
- links enviados;
- entradas confirmadas;
- saídas;
- pessoas ainda não confirmadas;
- mensagens enviadas;
- falhas;
- diagnósticos;
- transferências humanas;
- vendas;
- receita;
- conversão.

### Comparação entre campanhas

Permitir selecionar campanhas e comparar:

- investimento;
- leads;
- taxa de entrada;
- distribuição de segmentos;
- anúncios e criativos;
- objeções;
- compras;
- conversão;
- tempo entre conversa e entrada;
- primeira, segunda e terceira participação.

### Linha do tempo do contato

Exemplo:

```text
15:20 — clique atribuído ao AD 08
15:21 — conversa iniciada
15:21 — classificado como novo
15:21 — link do grupo T1 enviado
15:24 — entrada confirmada
quarta-feira — página de vendas aberta
quarta-feira — compra confirmada
```

---

## 11. Tudo que deve ser editável no painel

### Campanhas

- número, nome e código;
- datas e horários;
- status;
- fuso horário;
- produto e oferta;
- regras comerciais;
- mensagens e botões;
- grupos e limites;
- links;
- destinos de fallback;
- versão do prompt da IA.

### Mensagens

- boas-vindas;
- novo participante;
- reparticipante;
- veterano;
- aluno;
- contato já classificado;
- erro de integração;
- grupo indisponível;
- diagnóstico;
- atendimento humano;
- opt-out;
- lembretes permitidos pelo provedor;
- respostas rápidas.

### Botões e ações

- texto;
- ordem;
- ação;
- link;
- próxima etapa;
- ativação;
- fallback em texto numerado quando o provedor não suportar botão visual.

### IA

- provedor;
- modelo;
- prompt de comportamento;
- base de conhecimento;
- perguntas frequentes;
- limite de tamanho;
- limite de custo;
- tom;
- frases proibidas;
- condições de transferência humana;
- temperatura e parâmetros permitidos;
- modo desligado.

### Aparência

- nome do sistema;
- logotipo;
- favicon;
- cores;
- modo escuro/claro;
- tipografia;
- arredondamento;
- densidade de tabelas;
- textos do menu.

Partes de segurança não podem ser campos livres: autenticação, autorização, criptografia, validação de webhook, integridade do banco, idempotência e auditoria devem permanecer protegidas no código.

---

## 12. Carga inicial

Formato inicial de CSV:

```csv
telefone,nome,email,quantidade_participacoes,ultima_edicao,aluno,produto,origem,data_primeiro_contato,data_ultimo_contato,observacoes
```

Regras:

- telefone em formato internacional, somente dígitos;
- exemplo brasileiro: `5591999999999`;
- datas em `AAAA-MM-DD` ou ISO 8601;
- `aluno`: `sim` ou `nao`;
- o telefone é a chave primária de correspondência inicial;
- a importação deve ter pré-visualização;
- erros devem ser baixáveis;
- importação deve ser idempotente;
- aluno verdadeiro não pode ser rebaixado por um CSV antigo;
- primeiro contato mantém a data mais antiga;
- último contato mantém a data mais recente;
- participações não devem ser reduzidas;
- toda alteração por importação deve ser auditada;
- deve existir opção de desfazer o lote quando tecnicamente seguro.

Além do arquivo de contatos, a carga histórica pode usar um segundo CSV:

```csv
telefone,campanha,aluno_atual,status_na_campanha,marcado_saiu,rotulos_vcard,origem
```

Nesse histórico, `campanha` é o número confirmado da edição. Um telefone + campanha conta no máximo uma participação; rótulos de VCard são auditoria e nunca devem virar nome pessoal. Campanhas históricas podem ser criadas sem datas quando a data real não estiver disponível.

A API de participações será a fonte preferencial quando seu contrato for fornecido. O CSV servirá para carga inicial e correções controladas.

---

## 13. Arquitetura técnica recomendada

Monorepo TypeScript:

```text
/apps
  /web       → React + Vite + TypeScript
  /api       → Fastify + TypeScript
  /worker    → consumidores, filas, polling e sincronizações
/packages
  /domain    → regras de negócio puras
  /database  → Prisma, migrations e repositórios
  /shared    → schemas, tipos e utilitários
  /ui        → componentes do design system
/docs
/infra
```

Infraestrutura:

- PostgreSQL como fonte de verdade;
- Redis para filas, locks, rate limiting e cache;
- BullMQ ou equivalente para tarefas assíncronas;
- Prisma para esquema e migrations;
- Zod para validação;
- OpenAPI para contrato da API;
- Pino para logs estruturados;
- Vitest para testes unitários e integração;
- Playwright para testes ponta a ponta;
- Dockerfiles multi-stage;
- Docker Compose para desenvolvimento;
- EasyPanel para staging e produção.

O agente pode propor mudanças de biblioteca, mas não pode mudar a arquitetura sem criar um ADR em `/docs/adr` explicando motivo, riscos, migração e impacto.

---

## 14. Modelo de dados mínimo

Tabelas ou agregados esperados:

```text
admin_users
roles
permissions
sessions
contacts
contact_identifiers
campaigns
campaign_versions
campaign_participations
groups
group_memberships
group_events
integration_cursors
processed_events
lead_attributions
tracking_clicks
conversations
conversation_messages
message_templates
message_template_versions
flow_definitions
flow_versions
flow_steps
flow_buttons
diagnoses
human_handoffs
student_statuses
purchases
refunds
integration_connections
integration_logs
knowledge_documents
ai_configs
imports
import_rows
audit_logs
system_settings
```

Eventos relevantes devem ser armazenados de forma imutável, com uma projeção separada para o estado atual.

---

## 15. Segurança obrigatória

Meta de segurança: práticas equivalentes ao OWASP ASVS nível 2 para um painel administrativo com dados pessoais.

Requisitos mínimos:

- senhas com Argon2id;
- sessão em cookie `HttpOnly`, `Secure` e `SameSite` adequado;
- proteção CSRF quando aplicável;
- RBAC e autorização por recurso;
- rate limiting por IP, usuário e endpoint;
- bloqueio progressivo de login;
- MFA preparado ou implementado para administradores;
- cabeçalhos de segurança;
- CORS por allowlist;
- validação de toda entrada com schemas;
- consultas parametrizadas via ORM;
- segredos exclusivamente em ambiente seguro;
- tokens externos criptografados em repouso quando armazenados;
- redaction de tokens, telefone e payloads nos logs;
- auditoria de alterações administrativas;
- idempotência de webhooks e jobs;
- assinatura/autenticidade de webhooks quando suportado;
- proteção contra SSRF em URLs configuráveis;
- limites de tamanho e tipo em uploads CSV;
- antivírus ou análise quando futuramente houver uploads de arquivos;
- backups automáticos e teste real de restauração;
- política de retenção e exclusão;
- exportação e anonimização de dados;
- opt-out e bloqueio de mensagens;
- separação de staging e produção;
- usuário de banco com menor privilégio;
- migrations revisadas;
- secret scanning e dependency scanning no CI;
- nenhuma credencial em commit, issue, log, print ou prompt.

### Regra sobre tokens

Nunca cole tokens do GitHub, EasyPanel, WhatsApp, Eduzz ou xAI dentro deste README ou em prompts.

A forma correta é disponibilizar segredos por um cofre ou variável de ambiente do agente:

```text
GITHUB_TOKEN
EASYPANEL_API_TOKEN
XAI_API_KEY
WHATSAPP_MANAGER_TOKEN
WHATSAPP_PROVIDER_TOKEN
EDUZZ_CLIENT_SECRET
```

O prompt pode informar que a variável existe, mas não deve conter seu valor.

Se um PAT temporário do GitHub for inevitável:

- fine-grained;
- acesso a um único repositório;
- permissões mínimas;
- expiração máxima sugerida de 24 horas;
- nunca permitir administração da conta;
- revogar imediatamente após o uso;
- rotacionar se aparecer em qualquer saída.

O EasyPanel não recebe “commit”. O fluxo correto é:

```text
IA altera código → commit → push para GitHub → EasyPanel constrói e implanta a versão do repositório
```

---

## 16. Estratégia de branches e commits

Sugestão:

```text
main                 → produção, protegida
staging              → homologação
phase/01-foundation
phase/02-data-security
...
phase/10-release
```

Regras:

- uma branch por etapa;
- Conventional Commits;
- pull request com checklist;
- CI obrigatório;
- nenhum merge com teste quebrado;
- atualizar `/docs/PROJECT_STATE.md` em toda etapa;
- criar tag apenas para releases;
- migrations não devem ser reescritas depois de publicadas;
- commits pequenos dentro da etapa;
- um commit final de consolidação da etapa.

---

## 17. Estado persistente entre as IAs

A IA não deve depender da memória da conversa. O repositório deve conter:

```text
/docs/PROJECT_BRIEF.md
/docs/ARCHITECTURE.md
/docs/DATA_MODEL.md
/docs/SECURITY.md
/docs/INTEGRATIONS.md
/docs/TEST_STRATEGY.md
/docs/DEPLOYMENT.md
/docs/PROJECT_STATE.md
/docs/DECISIONS.md
/docs/adr/
```

`PROJECT_STATE.md` deve registrar:

- etapa atual;
- o que está pronto;
- o que foi testado;
- decisões tomadas;
- migrations aplicadas;
- integrações mockadas e reais;
- riscos conhecidos;
- entradas ainda necessárias do proprietário;
- próximo prompt autorizado.

---

## 18. Regras para qualquer IA que executar as etapas

1. Leia este README e todos os documentos em `/docs` antes de alterar o código.
2. Inspecione o repositório atual. Nunca assuma que está vazio.
3. Não pule etapas.
4. Não invente contrato de API. Quando faltar documentação, crie adapter, mock e teste de contrato pendente.
5. Não exponha segredos.
6. Não imprima valores de variáveis sensíveis.
7. Não faça deploy em produção antes da etapa 10.
8. Não use dados reais em testes.
9. Não faça migração destrutiva sem plano de backup e rollback.
10. Não marque teste como aprovado sem executá-lo.
11. Não silencie erro de lint, typecheck, build, migration ou teste.
12. Não deixe código crítico como pseudocódigo ou TODO oculto.
13. Quando houver bloqueio, pare e informe exatamente o dado necessário.
14. Atualize documentação e estado do projeto.
15. Faça commit e push somente depois de testes passarem.
16. Ao final, informe arquivos alterados, comandos executados, resultados e hash do commit.
17. Não avance para a próxima etapa no mesmo prompt.

---

# 19. Preparação antes do Prompt 1

Preencha os valores abaixo fora do repositório quando forem conhecidos:

```text
REPOSITORY_URL={{URL_DO_REPOSITORIO}}
DEFAULT_BRANCH=main
STAGING_BRANCH=staging
PROJECT_NAME=meteorico-crm
TIMEZONE=America/Belem
WEB_STAGING_DOMAIN={{DOMINIO_WEB_STAGING}}
API_STAGING_DOMAIN={{DOMINIO_API_STAGING}}
WEB_PRODUCTION_DOMAIN={{DOMINIO_WEB_PRODUCAO}}
API_PRODUCTION_DOMAIN={{DOMINIO_API_PRODUCAO}}
```

Materiais que devem ser disponibilizados ao agente, sem segredos embutidos:

- este README;
- kit `whatsapp-manager-api-kit.zip`;
- referência visual do dashboard;
- documentação da API de participações;
- respostas reais anonimizadas da API de participações;
- documentação da Eduzz;
- documentação do provedor oficial de mensagens privadas;
- textos e regras comerciais atuais;
- logotipo e ativos visuais;
- CSV histórico, inicialmente com dados fictícios para teste.

Acesso ao GitHub deve ser fornecido por integração instalada ou pela variável secreta `GITHUB_TOKEN`. O token nunca deve aparecer no prompt.

---

# 20. Prompt 1 — Fundação, especificação e repositório

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

# 21. Prompt 2 — Banco, campanhas, autenticação e auditoria

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

# 22. Prompt 3 — Design system e painel administrativo base

```text
Leia todo o estado do projeto e trabalhe apenas na etapa 3.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 2
BRANCH DESTA ETAPA: phase/03-admin-ui

OBJETIVO:
Construir o painel administrativo responsivo e o design system inspirado na referência escura com destaque verde-limão, sem copiar literalmente o layout de terceiros.

ESCOPO:
1. Login e logout completos no frontend.
2. Layout com sidebar, cabeçalho, breadcrumbs e área de conteúdo.
3. Componentes acessíveis:
   - botões;
   - inputs;
   - selects;
   - modais;
   - drawers;
   - tabelas;
   - paginação;
   - filtros;
   - cards;
   - gráficos base;
   - alertas;
   - skeletons;
   - empty states;
   - confirmações destrutivas.
4. Tema inicial:
   - escuro;
   - grafite;
   - verde-limão;
   - alto contraste;
   - responsivo.
5. Configurações editáveis de aparência salvas no banco.
6. Controle de navegação por permissão.
7. Telas placeholder funcionais para Dashboard, Campanhas, Grupos, Contatos, Mensagens, Fluxos, IA, Integrações, Importações, Auditoria e Configurações.
8. Storybook ou catálogo interno de componentes, se adequado.
9. Testes de acessibilidade e responsividade.

REGRAS:
- WCAG 2.1 AA como objetivo;
- navegação por teclado;
- labels e mensagens de erro;
- não depender apenas de cor;
- mobile utilizável;
- tema editável sem permitir CSS arbitrário inseguro;
- sanitização de logo e ativos;
- permissões aplicadas também no backend.

TESTES:
- componentes;
- login;
- proteção de rotas;
- navegação por função;
- visual smoke test;
- Playwright em desktop e mobile;
- acessibilidade automatizada;
- lint, typecheck e build.

CRITÉRIOS DE ACEITE:
- painel visualmente coerente;
- autenticação integrada;
- nenhuma tela quebra em celular;
- tema persiste;
- componentes reutilizáveis;
- documentação de design atualizada;
- PROJECT_STATE.md atualizado;
- commit e push.

Commit final sugerido: feat: build secure responsive admin design system
```

---

# 23. Prompt 4 — Campanhas, grupos, versões e importação inicial

```text
Leia o README e o PROJECT_STATE. Execute somente a etapa 4.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 3
BRANCH DESTA ETAPA: phase/04-campaigns-imports

OBJETIVO:
Entregar o núcleo operacional do painel: campanhas semanais, grupos, versões de configuração e carga inicial de contatos.

ESCOPO DE CAMPANHAS:
- CRUD seguro;
- rascunho, ativa, encerrada e arquivada;
- duplicação com incremento da edição;
- sugestão de datas +7 dias;
- quarta-feira como padrão configurável, nunca regra rígida oculta;
- validações antes de ativar;
- apenas uma campanha principal ativa, salvo feature flag futura;
- histórico e auditoria;
- versões publicadas imutáveis.

ESCOPO DE GRUPOS:
- múltiplos grupos por segmento;
- groupId externo;
- link de convite;
- limite;
- prioridade;
- status;
- fallback;
- ocupação estimada;
- validação de duplicidade;
- impedir que grupo de outra campanha seja entregue por engano.

ESCOPO DE IMPORTAÇÃO:
- upload CSV;
- preview;
- mapeamento de colunas;
- validação;
- normalização de telefone;
- relatório de erros;
- idempotência;
- upsert seguro;
- regras de precedência;
- auditoria;
- desfazer lote quando seguro;
- download de linhas rejeitadas.

USAR O CABEÇALHO:
telefone,nome,email,quantidade_participacoes,ultima_edicao,aluno,produto,origem,data_primeiro_contato,data_ultimo_contato,observacoes

HISTÓRICO OPCIONAL POR CAMPANHA:
telefone,campanha,aluno_atual,status_na_campanha,marcado_saiu,rotulos_vcard,origem

O número de campanha é referência histórica válida; não inventar datas. Um telefone + campanha deve ser idempotente.

REGRAS IMPORTANTES:
- importação histórica deve criar campanhas/participações históricas somente quando a informação for suficiente;
- nunca inventar data de entrada;
- não reduzir participação existente;
- aluno verdadeiro prevalece;
- dados duvidosos devem ser marcados com origem e confiança;
- mudanças manuais devem ser auditadas.

TESTES:
- duplicação semanal;
- ativação incompleta bloqueada;
- grupos por segmento;
- limite e prioridade;
- CSV válido, inválido, duplicado e grande;
- rollback de lote;
- permissões;
- E2E das telas.

CRITÉRIOS DE ACEITE:
- usuário consegue criar a próxima campanha sem código;
- consegue cadastrar links e groupIds;
- consegue importar base inicial com relatório;
- histórico permanece íntegro;
- testes e documentação aprovados;
- commit e push.

Commit final sugerido: feat: add campaign operations groups and safe imports
```

---

# 24. Prompt 5 — Consumidor da API de grupos e reconciliação

```text
Execute somente a etapa 5. Leia o kit do WhatsApp Manager e não invente endpoints.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da etapa 4
BRANCH DESTA ETAPA: phase/05-group-events

OBJETIVO:
Integrar de forma robusta a API somente leitura do WhatsApp Manager para confirmar entradas, adições, saídas e remoções.

CONTRATO DISPONÍVEL:
- GET /api/integration/health
- GET /api/integration/events
- GET /api/integration/snapshots
- autenticação Bearer por ambiente
- cursor crescente
- event_id determinístico
- number pode ser nulo

ESCOPO:
1. Criar adapter WhatsAppManagerReadProvider.
2. Worker de polling com intervalo configurável.
3. Cursor persistido por integração/consumidor.
4. Paginação completa.
5. Idempotência por event_id.
6. Processamento transacional.
7. Mapeamento de groupId para grupo e campanha.
8. Upsert de contato por número ou identificador disponível.
9. Registro de entrada, saída e reentrada.
10. Uma participação por contato e campanha.
11. Incrementar contagem apenas na primeira entrada confirmada daquela campanha.
12. Snapshots para reconciliação, sem inventar datas históricas.
13. Tela de saúde da integração, atraso, cursor, último evento e erros.
14. Reprocessamento seguro de evento com falha.
15. Dead-letter ou fila de falhas.
16. Alertas operacionais básicos.

REGRAS:
- persistir cursor depois do processamento;
- se cair, reprocessar com idempotência;
- groupId desconhecido vai para fila de associação manual, não para campanha inferida;
- number nulo não deve quebrar processamento;
- nomes podem vir vazios;
- não usar isSaved como classificação;
- nenhuma mensagem privada é enviada por esta integração.

TESTES:
- contrato com fixtures reais anonimizadas;
- paginação;
- queda entre evento e cursor;
- evento duplicado;
- entrada/saída/reentrada;
- duas pessoas no mesmo evento;
- number nulo;
- groupId desconhecido;
- indisponibilidade e retry;
- reconciliação por snapshot;
- concorrência de workers;
- integração com Postgres e Redis.

CRITÉRIOS DE ACEITE:
- entradas reais podem ser refletidas sem duplicação;
- painel mostra saúde;
- atraso é observável;
- participação por campanha é correta;
- testes passam;
- documentação atualizada;
- commit e push.

Commit final sugerido: feat: ingest and reconcile whatsapp group events
```

---

# 25. Prompt 6 — Conversa privada, redirecionador e atribuição

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

# 26. Prompt 7 — Motor de classificação e integrações de histórico/aluno

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

# 27. Prompt 8 — Mensagens, botões, fluxos e Grok

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

# 28. Prompt 9 — Dashboards, Eduzz, tráfego e relatórios

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

# 29. Prompt 10 — Auditoria final, segurança e EasyPanel

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

# 30. Checklist semanal depois que o sistema estiver pronto

1. Duplicar a campanha anterior.
2. Confirmar número da nova edição.
3. Revisar datas, especialmente abertura de quarta-feira.
4. Criar grupos no WhatsApp.
5. Cadastrar `groupId`, link, segmento, limite e prioridade.
6. Revisar mensagens e botões.
7. Revisar prompt e base da IA.
8. Testar como novo, reparticipante, veterano e aluno.
9. Testar link de rastreamento.
10. Publicar a versão da campanha.
11. Ativar campanha.
12. Acompanhar saúde das integrações.
13. Acompanhar ocupação dos grupos.
14. Conferir entradas não associadas.
15. Conferir falhas e handoffs.
16. Na abertura, conferir compra e atribuição.
17. Encerrar e congelar a campanha.
18. Gerar relatório.
19. Fazer backup.
20. Preparar a próxima edição.

---

# 31. Entradas ainda necessárias do proprietário

Antes das etapas correspondentes, fornecer:

- URL do repositório;
- conexão GitHub segura;
- logotipo e ativos;
- documentação da API de participações;
- exemplos anonimizados dessa API;
- provedor oficial de mensagens privadas e documentação;
- credenciais inseridas fora dos prompts;
- dados e contrato Eduzz;
- definição dos produtos que caracterizam aluno;
- textos atuais das mensagens;
- perguntas e respostas do negócio;
- regras de atendimento humano;
- domínio de staging e produção;
- configuração do EasyPanel;
- política desejada de retenção de dados;
- CSV histórico.

Quando uma entrada ainda não existir, a IA deve implementar apenas a interface e o mock correspondente, documentando o bloqueio. Não deve inventar contratos.

---

# 32. Definição de pronto

O projeto só estará pronto quando:

- o fluxo completo funcionar de ponta a ponta;
- regras forem determinísticas e auditáveis;
- IA não controlar decisões críticas;
- tudo estiver amarrado a contato e campanha;
- dados gerais e específicos forem coerentes;
- mensagens, botões, grupos, campanhas e aparência forem editáveis;
- integrações forem idempotentes e observáveis;
- nenhum segredo estiver no código;
- backups tiverem sido restaurados em teste;
- testes automatizados cobrirem os cenários críticos;
- staging e produção forem reproduzíveis no EasyPanel;
- documentação permitir manutenção por outro desenvolvedor;
- o proprietário conseguir operar uma nova campanha sem alterar código.

