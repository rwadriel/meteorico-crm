# Contexto completo — CRM Meteórico

> Documento de contexto para outra inteligência artificial.
>
> Estado de referência: **31 de agosto de 2026 — versão v0.10.0**.
>
> Este arquivo descreve o comportamento existente no código e na implantação atual. Ele não contém senhas, tokens, chaves da Meta, credenciais do CRM ou dados pessoais completos.

## 1. Resumo executivo

O **CRM Meteórico** é um sistema próprio para administrar contatos e realizar campanhas oficiais de WhatsApp para o negócio **Música Lucrativa com IA**, principalmente antes, durante e depois das edições do Meteórico.

O fluxo operacional principal é:

1. importar um CSV de contatos;
2. transformar cada importação em um público independente;
3. cadastrar ou sincronizar templates oficiais da Meta;
4. escolher um público e um template aprovado;
5. executar uma simulação sem envio;
6. iniciar, agendar, pausar, continuar ou cancelar a campanha;
7. enviar em lotes pela WhatsApp Business Cloud API oficial;
8. acompanhar submissões, entregas, leituras, respostas, falhas, opt-outs e cliques;
9. impedir automaticamente novos envios para compradores, opt-outs, números inválidos e duplicidades recentes.

O sistema não usa WhatsApp Web, Baileys ou Evolution API para os disparos. O canal de envio implementado é a **WhatsApp Business Cloud API oficial da Meta**.

## 2. Estado atual da produção

- Versão visual e funcional: **v0.10.0**.
- Código publicado na branch `main`.
- Aplicação implantada no EasyPanel com Docker Compose.
- Domínio oficial: `https://meteorico.musicalucrativa.com.br/`.
- Domínio técnico alternativo: `https://zapgrupos-meteorico-crm.gq2dju.easypanel.host/`.
- API, banco PostgreSQL, frontend e n8n são executados como serviços separados.
- As migrações do banco são aplicadas automaticamente antes da inicialização da API.
- A verificação HTTP de saúde da API estava respondendo como saudável após o deploy da v0.10.0.
- O painel de configurações mostra o estado efetivo do provedor Meta, versão da Graph API, trava de disparos, n8n e quantidade de templates aprovados.

O estado de variáveis operacionais pode mudar sem alteração de código. Para saber se o envio está habilitado neste exato momento, deve-se consultar **Configurações → Status do WhatsApp**.

## 3. Conceitos que não devem ser confundidos

### 3.1 Contato global

Um telefone normalizado corresponde a um único contato global no banco. Reimportar o mesmo número não cria outro contato; atualiza ou reutiliza o existente.

O contato pode pertencer a vários públicos e participar de várias campanhas, mantendo o histórico global de:

- telefone e nome;
- e-mail, quando disponível;
- origem;
- participação em edições;
- status de aluno/comprador;
- compras e reembolsos;
- mensagens e campanhas;
- respostas;
- opt-in e opt-out;
- cliques;
- conversas e classificações.

### 3.2 Público ou lista de contatos

Cada CSV confirmado cria um **público independente**. Uma campanha de follow-up é enviada apenas para o público selecionado.

O mesmo contato pode estar em vários públicos. Isso não duplica o contato global nem permite duas mensagens para o mesmo contato dentro da mesma campanha.

Os públicos podem ser:

- listados;
- visualizados com seus contatos e motivos de exclusão;
- renomeados;
- arquivados sem apagar o histórico.

### 3.3 Dois tipos de campanha existentes no sistema

Há dois domínios diferentes chamados de campanha:

1. **Campanha de lançamento (`Campaign`)**: representa uma edição do Meteórico, com datas, versões, grupos, participantes, classificação e relatórios históricos.
2. **Campanha de disparo (`FollowupCampaign`)**: representa o envio de um template oficial para um público importado, com lotes, métricas, respostas, opt-outs e cliques.

Na interface principal atual, o item **Campanhas** do menu abre o segundo tipo, isto é, as campanhas reais de follow-up pelo WhatsApp.

## 4. Interface principal visível

O menu principal da v0.10.0 possui:

1. **Dashboard**
2. **Contatos**
3. **Públicos**
4. **Importar CSV**
5. **Campanhas**
6. **Templates**
7. **Configurações**

A identidade visual é escura, com verde-limão, fonte Montserrat, layout responsivo, menu lateral recolhível e adaptação para iPhone e telas pequenas.

### 4.1 Dashboard

Apresenta uma visão operacional resumida:

- total de contatos;
- contatos elegíveis;
- percentual de elegibilidade;
- quantidade de campanhas;
- opt-outs globais;
- telefones inválidos;
- métricas da campanha mais recente;
- submetidas, entregues, lidas e respostas;
- funil visual da campanha mais recente;
- distribuição do público entre disponíveis, opt-outs e inválidos;
- lista de campanhas recentes e seus números principais.

### 4.2 Contatos

Permite:

- listar contatos com paginação;
- pesquisar por nome, telefone ou e-mail;
- filtrar por aluno, status de compra e opt-out;
- visualizar estatísticas de total, compradores, opt-outs e elegíveis;
- editar nome, e-mail, status de aluno, status de compra e bloqueio de envio;
- consultar o histórico individual;
- ver públicos aos quais o contato pertence;
- ver participações, compras e mensagens de follow-up;
- ver última campanha, último status e data de envio;
- bloquear manualmente um telefone digitando somente o número;
- exportar todos os opt-outs em CSV.

Telefones e e-mails são mascarados nas respostas comuns da interface para reduzir exposição de dados pessoais.

### 4.3 Públicos

Permite:

- listar todos os públicos ativos;
- ver total, elegíveis, compradores, opt-outs e inválidos por público;
- consultar os contatos de um público;
- mostrar para cada contato se está elegível ou se foi excluído por telefone inválido, compra ou opt-out;
- mostrar metadados de consentimento associados à importação;
- renomear o público;
- arquivar o público.

### 4.4 Importar CSV

Aceita arquivos CSV com vírgula, ponto e vírgula ou tabulação. O cabeçalho mínimo para contatos é um campo de telefone.

Nomes de coluna reconhecidos incluem:

- `telefone`, `phone`, `whatsapp`, `celular`, `numero` ou `number`;
- `nome` ou `name`;
- `email`;
- `quantidade_participacoes` ou `participacoes`;
- `ultima_edicao`;
- `aluno`;
- `produto` ou `product`;
- `origem` ou `origin`;
- datas do primeiro e último contato;
- `observacoes` ou `notes`;
- `comprou`, `purchase`, `cliente` ou `status_compra`;
- `origem_campanha` ou `campaign_source`.

Também há suporte técnico para CSV de participações históricas, com telefone, campanha, aluno atual, status, marcação de saída, rótulos vCard e origem.

Antes da confirmação, a importação gera uma prévia com:

- linhas totais, válidas e inválidas;
- novos contatos;
- contatos existentes e atualizados;
- duplicados no próprio arquivo;
- telefones inválidos;
- alunos detectados;
- participações a criar;
- divergências e avisos.

A importação registra opcionalmente:

- nome do público;
- edição do Meteórico;
- URL da página de inscrição;
- origem do consentimento;
- texto exato do consentimento;
- versão do texto;
- data da captação/lista.

Depois da prévia é possível confirmar ou reverter a importação. O parser remove prefixos perigosos de fórmula de planilha e normaliza telefones para uma identidade canônica.

### 4.5 Campanhas de follow-up

Na criação de uma campanha o operador informa:

- nome da campanha;
- público importado;
- template aprovado;
- valores das variáveis `{{1}}`, `{{2}}` etc.;
- URL HTTPS, quando o template exige link;
- mensagens por lote, de 1 a 25;
- intervalo entre lotes, de 10 a 300 segundos;
- janela de não repetição do mesmo template, de 0 a 365 dias;
- data e hora de agendamento opcional.

Estados possíveis incluem:

- rascunho;
- pronta;
- agendada;
- executando;
- pausada;
- concluída;
- cancelada.

Ações disponíveis:

- **Modo Teste / dry run**: não envia mensagens; calcula elegíveis e exclusões;
- iniciar campanha real com confirmação;
- agendar;
- pausar;
- continuar;
- cancelar;
- exportar o resultado em CSV.

O relatório de campanha contém:

- telefone;
- status;
- data de submissão;
- data de entrega;
- data de leitura;
- resposta;
- quantidade de cliques;
- data do primeiro clique;
- opt-out e sua data;
- código de erro.

### 4.6 Templates

O CRM gerencia templates oficiais do WhatsApp na conta Meta.

Ao criar um template, permite informar:

- nome técnico em letras minúsculas, números e sublinhados;
- nome amigável para exibição no CRM;
- idioma, atualmente usado como `pt_BR` na interface principal;
- categoria solicitada: Marketing ou Utility;
- corpo de até 1.024 caracteres;
- variáveis posicionais sequenciais `{{1}}`, `{{2}}` etc.;
- um exemplo obrigatório para cada variável;
- rodapé opcional de até 60 caracteres;
- permissão para a Meta alterar automaticamente a categoria;
- cabeçalho sem mídia ou com imagem.

#### Imagem no template

A v0.10.0 permite cabeçalho em imagem:

- formatos JPG e PNG;
- tamanho máximo de 5 MB no CRM;
- prévia antes do envio;
- upload da amostra para a Meta durante a criação;
- armazenamento seguro da imagem no banco para uso futuro;
- upload da mídia para o número oficial no início da campanha;
- envio do template com o componente oficial de imagem no cabeçalho.

#### Botões no template

A v0.11.0 inclui um construtor visual de botões na criação do template:

- um botão de URL dinâmica rastreada;
- até três respostas rápidas;
- conjunto recomendado pronto com “Acessar conteúdo”, “Quero saber mais”, “Preciso de ajuda” e “SAIR”;
- prévia dos botões na criação do template e da campanha;
- sincronização das definições oficiais dos botões com a Meta;
- URL de destino escolhida em cada campanha, sem precisar criar um template novo;
- código individual por destinatário, redirecionamento seguro e medição de cliques;
- reconhecimento de respostas rápidas recebidas pelo webhook;
- “SAIR” registra opt-out global automaticamente e bloqueia envios futuros, inclusive após nova importação do número.

O botão tem duas configurações deliberadamente separadas:

- no **template**, define-se o tipo e o texto visível do botão, que fazem parte do modelo aprovado pela Meta;
- na **campanha**, informa-se a página final que será aberta, permitindo reutilizar o mesmo template em campanhas com destinos diferentes.

A partir da v0.11.1, novos templates usam `https://musicalucrativa.com.br/r/<codigo>` como endereço visível. O plugin WordPress `Meteórico Link Tracker` encaminha esse código ao coletor do CRM, registra o clique e abre a página final da campanha. O subdomínio técnico do CRM deixa de aparecer na mensagem.

Neste momento, a interface principal não cria cabeçalho em vídeo ou documento.

#### Classificação e aprovação

O CRM analisa o texto e sugere Marketing, Utility ou Authentication, com justificativas e nível de confiança. Essa análise é apenas uma recomendação. A classificação final é sempre da Meta.

O CRM sincroniza:

- status de aprovação;
- categoria final;
- qualidade;
- motivo de rejeição;
- atualizações recebidas pelo webhook da Meta.

Somente templates `APPROVED` aparecem para criação de campanhas. A sincronização também arquiva localmente templates que deixaram de existir na Meta.

O botão de exclusão remove o template pela API da Meta e o marca como excluído/inativo no CRM.

### 4.7 Configurações

Exibe somente indicadores, nunca os valores das credenciais:

- provedor de WhatsApp;
- versão da Graph API;
- disparos ativados ou bloqueados;
- Meta configurada ou pendente;
- n8n configurado ou pendente;
- templates aprovados.

Também permite:

- sincronizar todos os números do mesmo WABA com a Meta;
- definir um nome interno para identificar cada número no CRM;
- liberar ou bloquear cada número para novas campanhas;
- escolher um número remetente padrão;
- alterar configurações persistidas do sistema;
- alterar a própria senha;
- encerrar todas as sessões abertas após troca de senha;
- ao proprietário, criar e administrar usuários;
- desativar e reativar acessos;
- redefinir a senha de outro usuário;
- ver perfil, status e último acesso.

## 5. Regras de elegibilidade e proteção de envio

Um contato só entra na fila se:

- pertencer ao público escolhido;
- possuir telefone normalizado válido;
- não estiver marcado como aluno;
- não possuir compra confirmada;
- não tiver `purchaseStatus=purchased`;
- não tiver opt-out global de WhatsApp;
- não tiver recebido recentemente o mesmo template dentro da janela de cooldown.

O sistema conta separadamente as exclusões por:

- telefone inválido;
- comprador/aluno;
- opt-out;
- duplicidade recente.

O contato é verificado novamente imediatamente antes do envio. Portanto, se comprar ou pedir para sair depois da criação da campanha e antes de seu lote, será pulado.

Há uma restrição única de banco por campanha + contato, impedindo duplicidade dentro da mesma campanha.

### Consentimento

O CRM consegue registrar fonte, texto, versão e data de consentimento na importação. A pré-verificação informa quantos elegíveis não possuem `optedInAt` registrado.

Importante: no comportamento atual, **consentimento ausente gera indicador, mas não bloqueia automaticamente o envio**. A responsabilidade operacional é importar apenas pessoas que tenham base válida para receber mensagens e manter a prova correspondente.

## 6. Opt-out e respostas

O webhook oficial recebe mensagens enviadas pelos contatos.

Quando uma pessoa responde, o CRM:

- vincula a resposta ao contato;
- marca a campanha mais recente como respondida;
- atualiza as métricas;
- detecta palavras e frases de cancelamento;
- grava o opt-out global no contato e em suas preferências.

Entre as expressões reconhecidas estão:

- SAIR;
- PARAR;
- PARE;
- CANCELAR;
- REMOVER;
- STOP;
- NÃO QUERO;
- NÃO TENHO INTERESSE;
- variações como “quero sair”, “não quero mais receber” e “me remova da lista”.

O opt-out é global e persistente. Reimportar o mesmo número em outro CSV não remove o bloqueio. Assim, se 50 pessoas pedirem para sair e forem reimportadas depois, continuam excluídas automaticamente.

Essa proteção também é global entre remetentes: uma pessoa que pediu para sair por qualquer número não recebe novas campanhas por outro número cadastrado no mesmo CRM.

O operador também pode bloquear manualmente um número na tela de contatos e exportar a lista global de opt-outs.

## 7. Compradores

O CRM reconhece comprador por qualquer um destes sinais:

- `isStudent=true`;
- `totalPurchases > 0`;
- `purchaseStatus=purchased`;
- eventos de compra recebidos pela integração Eduzz, quando configurada.

No processo operacional atual, os novos CSVs normalmente já são exportados contendo apenas quem não comprou. Mesmo assim, a proteção interna continua verificando o status global antes do envio.

A integração automática com a plataforma de vendas é opcional e pode permanecer desativada. Quando não está configurada, o CRM não adivinha sozinho quem comprou fora dele; essa informação precisa vir do CSV, de edição manual ou de uma integração de vendas.

## 8. Rastreamento de cliques

A v0.10.0 implementa rastreamento individual de links de campanha.

Quando um template exige URL e a campanha possui uma URL de destino:

1. o CRM cria um código aleatório individual para cada mensagem/contato;
2. substitui a primeira variável de URL por um link do domínio oficial no formato `/api/t/<codigo>`;
3. o destinatário abre esse link;
4. o CRM registra o clique;
5. o usuário é redirecionado para a URL original da campanha.

São registrados:

- cliques totais;
- contatos com pelo menos um clique, chamados de cliques únicos;
- primeiro clique de cada contato;
- URL de destino;
- contato e campanha;
- IP, user-agent e referer técnicos da visita.

O painel mostra:

- **Cliques únicos**;
- **Cliques totais**;
- **CTR**, calculado como cliques únicos dividido por mensagens entregues.

O relatório CSV também inclui cliques e primeiro clique.

Limitações importantes:

- o rastreamento vale para campanhas novas criadas após a implantação da funcionalidade;
- links enviados anteriormente não ganham rastreamento retroativo;
- o template precisa conter uma variável usada como URL;
- no fluxo atual, a primeira variável é tratada como URL rastreável quando o texto é identificado como template com link;
- bloqueadores de rastreamento, pré-carregamento de links e ferramentas de segurança do aparelho podem afetar a precisão;
- como IP e user-agent são registrados, a política de privacidade deve refletir essa telemetria.

## 9. Envio pela Meta e processamento em lotes

O envio real exige simultaneamente:

- provedor `meta_cloud`;
- trava `WHATSAPP_OUTBOUND_ENABLED=true`;
- token Meta válido;
- Phone Number ID e WABA corretos;
- webhook oficial validado;
- template aprovado;
- n8n e token interno configurados.

O n8n possui workflows para:

1. iniciar e processar a campanha em lotes;
2. atualizar métricas após eventos de status;
3. consolidar resposta e opt-out;
4. revisar falhas transitórias e campanhas agendadas periodicamente.

Falhas HTTP 429 ou 5xx da Meta são consideradas transitórias. O CRM agenda novas tentativas com espera exponencial e realiza no máximo três tentativas antes de marcar a mensagem como falha.

Uma falha individual não interrompe os demais contatos. Pausar impede novos lotes; continuar retoma a execução; cancelar marca o restante da fila como ignorado.

## 10. Status de mensagem e métricas

O webhook da Meta processa, de forma idempotente:

- mensagem submetida;
- enviada;
- entregue;
- lida;
- falha;
- mensagem recebida do contato;
- atualizações de template.

Cada evento externo possui proteção contra processamento duplicado.

Métricas de campanha disponíveis:

- total do público;
- elegíveis;
- na fila;
- submetidas;
- enviadas;
- entregues;
- lidas;
- falhas;
- respostas;
- opt-outs;
- cliques totais;
- cliques únicos;
- CTR.

## 11. Usuários, autenticação e permissões

O acesso ao painel usa e-mail e senha. Senhas têm mínimo de 12 caracteres e são armazenadas com Argon2id.

As sessões usam cookie HTTP-only, Secure e SameSite. Troca de senha, redefinição administrativa ou desativação do usuário revogam as sessões existentes.

Perfis existentes:

- **owner**: acesso total e gestão de usuários;
- **admin**: gestão de campanhas, contatos, grupos, mensagens e configurações, mas sem criar outros proprietários;
- **operator**: operação de campanhas, contatos e mensagens;
- **analyst**: leitura de dados e relatórios;
- **read_only**: leitura limitada ao dashboard/relatórios básicos.

O proprietário principal:

- não pode ser criado pela interface;
- não pode ser desativado ou alterado por outro usuário nessa tela;
- deve mudar a própria senha pela seção Segurança.

O sistema aplica RBAC tanto na interface quanto em cada rota da API.

## 12. Segurança e auditoria

Proteções implementadas incluem:

- Argon2id para senhas;
- sessões protegidas e armazenadas como hash;
- rate limiting global e reforçado no login;
- verificação de Origin/Referer contra CSRF em mutações;
- CORS limitado aos domínios do CRM;
- headers de segurança via Helmet;
- validação de entradas com Zod;
- consultas parametrizadas via Prisma;
- mascaramento de telefone e e-mail;
- sanitização contra fórmulas em CSV;
- logs estruturados com redação de informações sensíveis;
- segredos somente em variáveis protegidas do EasyPanel;
- comparação em tempo constante para tokens e assinaturas;
- assinatura HMAC `X-Hub-Signature-256` no webhook Meta;
- rejeição de eventos de WABA ou Phone Number ID diferentes dos configurados;
- idempotência de eventos, mensagens e filas;
- registros de auditoria de ações administrativas.

O histórico de auditoria registra, entre outros:

- login, logout e falhas;
- criação, alteração e exclusão de recursos;
- importações e reversões;
- templates;
- campanhas;
- opt-outs manuais;
- usuários e senhas redefinidas;
- configurações;
- IP e user-agent administrativo quando aplicável.

## 13. Módulos avançados existentes no código

Os módulos abaixo estão implementados e possuem rotas próprias, mas não aparecem no menu principal simplificado da v0.10.0. Eles podem ser acessados diretamente conforme permissões ou expandidos em uma versão futura.

### 13.1 Campanhas de lançamento

- CRUD de edições;
- nome, slug, número da edição e timezone;
- início da captação, abertura e encerramento;
- estados draft, active, completed e archived;
- duplicação de campanha com grupos e datas ajustadas;
- versionamento;
- exportação e comparação analítica.

### 13.2 Grupos de WhatsApp

- grupos vinculados a campanhas de lançamento;
- categorias novo, reparticipante, veterano, aluno e geral;
- capacidade, prioridade e link de convite;
- ocupação e membros;
- eventos imutáveis de entrada e saída;
- detecção de grupos órfãos e associação manual a uma campanha;
- integração de leitura com WhatsApp Manager.

### 13.3 Classificação de contatos

Classificações:

- aluno;
- novo;
- reparticipante;
- veterano;
- `needs_review` nos fluxos que não devem alocar automaticamente.

O sistema permite classificar, simular a classificação e aplicar override manual auditado. A classificação usa o histórico global do contato.

### 13.4 Conversas privadas e fila de mensagens

- registro de conversas e mensagens recebidas/enviadas;
- associação a contatos e participações;
- mensagens manuais enfileiradas com chave de idempotência;
- bloqueio automático por opt-out ou atendimento humano;
- estados e tentativas persistidas;
- filas BullMQ `outbound-messages` e `integration-tasks` no modo completo da arquitetura.

O Docker Compose compacto atualmente usado no EasyPanel para o follow-up não sobe Redis nem o worker BullMQ; o disparo principal em produção usa API + PostgreSQL + n8n. O código de filas e worker continua no monorepo para o modo de arquitetura completo.

### 13.5 Links genéricos e atribuição

Além dos links individuais de follow-up, existe um módulo anterior de links curtos para destinos oficiais do WhatsApp:

- `api.whatsapp.com`;
- `wa.me`;
- `chat.whatsapp.com`.

Ele suporta:

- ativar/desativar;
- expiração;
- limite de usos;
- contagem de cliques;
- UTM source, medium, campaign e content;
- fbclid;
- IDs de campanha, conjunto, anúncio e criativo da Meta;
- placement;
- atribuição de conversa e nível de confiança.

Esse módulo é separado do rastreamento individual de URLs de oferta das campanhas de follow-up.

### 13.6 Fluxos de conversa

- criação de definições de fluxo;
- gatilhos;
- versões;
- passos ordenados;
- configuração por passo;
- botões e próxima etapa;
- publicação de versão.

### 13.7 IA e base de conhecimento

- documentos de conhecimento com título, conteúdo e categoria;
- criação, edição, listagem e desativação;
- diagnóstico de contatos veteranos;
- histórico recente de conversa como contexto;
- recomendações e objeção sugerida;
- playground com limite de tokens;
- provedor xAI/Grok quando `XAI_API_KEY` está configurada;
- provedor mock quando a chave não está configurada.

O uso de IA não é necessário para o fluxo principal de CSV + template + disparo.

### 13.8 Atendimento humano

- criação de handoff de conversa;
- motivo e responsável;
- listagem por status;
- resolução do handoff;
- bloqueio de respostas automáticas enquanto a conversa está em atendimento humano.

### 13.9 Analytics avançado

- dashboard global com filtro de período;
- dashboard por campanha;
- dashboard por grupo;
- timeline de contato;
- comparação entre 2 e 10 campanhas;
- catálogo de definições de métricas;
- exportação CSV segura.

### 13.10 Integração Eduzz

Existe webhook com assinatura HMAC para:

- compra;
- reembolso;
- cancelamento;
- atualização de status do contato e métricas relacionadas.

Essa integração é opcional e depende de `EDUZZ_WEBHOOK_SECRET`. No uso atual foi decidido deixar a automação de compradores para uma etapa posterior.

### 13.11 WhatsApp Manager

Existe integração de leitura para:

- eventos de grupos;
- snapshots e reconciliação;
- cursores de sincronização;
- estado de saúde;
- grupos órfãos.

Ela é separada da Cloud API oficial usada para mensagens privadas. O CRM não tenta reconectar nem controlar uma sessão do Manager quando o provedor não oferece endpoint oficial para isso.

## 14. Arquitetura técnica

Monorepo TypeScript com pnpm workspaces:

- `apps/web`: React 19 + Vite, interface administrativa;
- `apps/api`: Fastify, regras HTTP, autenticação, webhooks e integração Meta;
- `apps/worker`: worker BullMQ para o modo completo;
- `packages/database`: Prisma e PostgreSQL;
- `packages/domain`: lógica de domínio;
- `packages/shared`: tipos e regras compartilhadas;
- `packages/ui`: componentes compartilhados;
- `n8n/workflows`: orquestração do follow-up.

Tecnologias principais:

- Node.js 22 no deploy;
- TypeScript;
- React;
- Fastify;
- PostgreSQL 17;
- Prisma 6;
- n8n;
- Redis 7 e BullMQ no modo completo;
- Zod;
- Pino;
- Vitest;
- Docker e EasyPanel.

Fluxo principal em produção:

```text
Navegador
  -> Frontend React/Nginx
  -> API Fastify
  -> PostgreSQL
  -> n8n
  -> API interna em lotes
  -> Meta Graph API
  -> WhatsApp do destinatário

Meta Webhook
  -> API Fastify com validação HMAC
  -> atualização idempotente no PostgreSQL
  -> atualização de métricas / opt-out / resposta
```

## 15. Principais entidades de dados

- Role e Permission;
- AdminUser e Session;
- Contact e ContactIdentifier;
- ContactPreference;
- ContactList e ContactListMembership;
- Import e ImportRow;
- Campaign e CampaignVersion;
- CampaignParticipation;
- FollowupCampaign e FollowupCampaignMessage;
- Group, GroupMembership e GroupEvent;
- Conversation e ConversationMessage;
- MessageTemplate e MessageTemplateVersion;
- RedirectLink e TrackingClick;
- LeadAttribution;
- ProcessedEvent;
- OutboundRecord;
- FlowDefinition, FlowVersion, FlowStep e FlowButton;
- Diagnosis, KnowledgeDocument e AiConfig;
- HumanHandoff;
- StudentStatus, Purchase e Refund;
- IntegrationConnection, IntegrationCursor e IntegrationLog;
- AuditLog;
- SystemSetting.

## 16. Superfície principal da API

Todas as rotas administrativas usam autenticação e permissões, salvo health checks, redirecionadores e webhooks públicos assinados.

| Área | Rotas/funções principais |
|---|---|
| Saúde | `/health`, `/readiness` |
| Autenticação | login, logout, usuário atual, sessões e troca de senha |
| Usuários | listar, criar, alterar perfil/status e redefinir senha |
| Contatos | listar, estatísticas, detalhe, editar, opt-out por telefone e exportar opt-outs |
| Públicos | listar, ver contatos, renomear e arquivar |
| Importações | listar, pré-visualizar, confirmar, reconciliar, divergências e rollback |
| Follow-up | templates disponíveis, públicos, preflight, campanhas, dry run, iniciar, pausar, continuar, cancelar e exportar |
| Templates Meta | analisar categoria, criar, sincronizar, servir imagem e excluir |
| Webhook Meta | verificação GET e eventos POST assinados |
| Rastreamento | `/t/:code` para link individual e `/r/:code` para link genérico |
| Analytics | global, campanha, grupo, timeline, comparação, métricas e exportação |
| Campanhas clássicas | CRUD, ativar, completar, arquivar, duplicar e versionar |
| Grupos | CRUD e associação a campanha |
| Mensagens | links, atribuições, opt-in/out e mensagens em conversa |
| Classificação | classificar, simular e override |
| Fluxos | CRUD lógico, passos, versões e publicação |
| IA | diagnósticos, playground e base de conhecimento |
| Handoff | criar, listar e resolver atendimento humano |
| Integrações | saúde, grupos órfãos, Meta verify e Eduzz webhook |
| Operação | auditoria, configurações e status de filas |

## 17. Variáveis operacionais importantes

Os valores são segredos do ambiente e não devem ser enviados a outra IA. Os nomes relevantes são:

- `DATABASE_URL`;
- `SESSION_SECRET`;
- `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_NAME`;
- `WHATSAPP_PRIVATE_PROVIDER`;
- `WHATSAPP_OUTBOUND_ENABLED`;
- `WHATSAPP_STAGING_ALLOWLIST`;
- `META_WHATSAPP_ACCESS_TOKEN`;
- `META_WHATSAPP_PHONE_NUMBER_ID`;
- `META_WHATSAPP_WABA_ID`;
- `META_WHATSAPP_VERIFY_TOKEN`;
- `META_APP_SECRET`;
- `META_APP_ID`;
- `META_GRAPH_API_VERSION`;
- `N8N_INTERNAL_TOKEN`;
- `N8N_CAMPAIGN_WEBHOOK_URL`;
- `N8N_STATUS_WEBHOOK_URL`;
- `N8N_INBOUND_WEBHOOK_URL`;
- `N8N_ENCRYPTION_KEY`;
- `TRACKING_BASE_URL`;
- `TRACKING_LINK_BASE_URL`;
- `CRM_PUBLIC_URL`;
- `EDUZZ_WEBHOOK_SECRET`;
- `XAI_API_KEY`;
- `REDIS_URL` no modo completo.

## 18. Limitações e pontos que ainda podem evoluir

1. A integração automática com a plataforma de vendas não é necessária no fluxo atual e pode estar desativada.
2. Consentimento ausente é sinalizado, mas ainda não bloqueia o disparo automaticamente.
3. Templates com vídeo e documento ainda não fazem parte da interface principal.
4. O rastreamento de clique funciona em botões de URL dinâmica criados pelo CRM e em links variáveis antigos; não é retroativo.
5. A qualidade e aprovação de templates dependem da Meta, não do CRM.
6. O CRM não consegue garantir que uma pessoa leu conscientemente o texto de consentimento; ele apenas registra a evidência fornecida.
7. O status “pessoa não está mais no WhatsApp” exibido no aplicativo do destinatário é uma interpretação do cliente WhatsApp e não invalida, por si só, a entrega registrada pela Cloud API. O indicador confiável para o CRM é o webhook da Meta.
8. Os módulos avançados de grupos, fluxos, IA, auditoria e campanhas clássicas existem, mas estão fora do menu principal simplificado.
9. Redis e worker não participam do Docker Compose compacto atual; o follow-up de produção é orquestrado pelo n8n.
10. Dados operacionais e segredos continuam no EasyPanel e nunca devem ser copiados para documentos de contexto.
11. O nome interno do remetente é editável no CRM, mas o nome público exibido no WhatsApp é controlado e aprovado pela Meta.

## 19. Regras para qualquer IA que analise este sistema

Ao usar este documento como contexto, a outra IA deve:

1. distinguir funcionalidades realmente implementadas de ideias futuras;
2. não inventar credenciais, tokens, Phone Number IDs, WABA IDs ou senhas;
3. não presumir que uma variável de produção está ativa apenas porque o código suporta a função;
4. consultar o painel de Configurações para estado operacional atual;
5. tratar dados de contatos como dados pessoais sujeitos à LGPD;
6. não recomendar meios não oficiais de disparo;
7. preservar opt-outs globalmente;
8. não sugerir remover proteções de comprador, cooldown, idempotência ou trava de envio;
9. lembrar que a categoria final e a aprovação do template são decisões da Meta;
10. diferenciar campanhas clássicas de lançamento e campanhas de follow-up;
11. diferenciar links genéricos de WhatsApp e links individuais rastreados de oferta;
12. apontar riscos e limitações explicitamente quando fizer recomendações.

## 20. Procedimento operacional resumido

```text
1. Preparar CSV contendo telefone e, opcionalmente, nome e outros dados.
2. Importar CSV e preencher os metadados do público/consentimento.
3. Conferir a prévia e confirmar.
4. Cadastrar ou sincronizar um template oficial.
5. Se quiser imagem, selecionar JPG/PNG no cabeçalho antes de enviar à Meta.
6. Aguardar o template ficar APPROVED.
7. Em Configurações, sincronizar números com a Meta e liberar somente os já conectados.
8. Criar campanha escolhendo explicitamente o público e o número remetente.
9. Preencher variáveis e URL HTTPS.
10. Configurar lote, intervalo, cooldown e agendamento.
11. Rodar Modo Teste.
12. Conferir elegíveis, exclusões, consentimentos ausentes e remetente selecionado.
13. Iniciar a campanha real.
14. Acompanhar entrega, leitura, resposta, opt-out, clique e CTR.
15. Pausar ou cancelar se houver anomalia.
16. Exportar o relatório final em CSV.
```

## 21. Histórico recente relevante

- identidade visual aplicada em todo o sistema;
- fonte Montserrat e dashboard modernizado;
- responsividade revisada para iPhone;
- gestão de usuários e perfis;
- correção de CORS para o domínio oficial;
- públicos independentes por CSV;
- registro de consentimento por importação;
- opt-out manual por telefone e opt-out automático via webhook;
- exclusão e sincronização de templates Meta;
- cabeçalho de imagem em templates;
- rastreamento individual de cliques, cliques únicos e CTR;
- versão publicada: **v0.10.0**.
