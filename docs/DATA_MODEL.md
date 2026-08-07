# Modelo de Dados Conceitual

Este documento descreve o modelo de dados conceitual do Meteorico CRM.
O schema real sera implementado com Prisma na Etapa 02.

## Diagrama de relacionamentos (simplificado)

```
┌─────────────┐       ┌──────────────┐       ┌──────────────────────┐
│  contacts   │──1:N──│  contact_    │       │  campaigns           │
│             │       │  identifiers │       │                      │
└──────┬──────┘       └──────────────┘       └──────────┬───────────┘
       │                                                │
       │                                         1:N    │
       │         ┌──────────────────────┐               │
       │         │ campaign_            │───────────────N│
       └──1:N────│ participations       │
                 └──────────┬───────────┘
                            │
                     ┌──────┴───────┐
                     │    groups    │
                     └──────┬──────┘
                            │
                     ┌──────┴──────────┐
                     │group_memberships│
                     └──────┬──────────┘
                            │
                     ┌──────┴──────┐
                     │group_events │
                     └─────────────┘
```

## Tabelas por agregado

### Administracao e Autenticacao

#### admin_users

Usuarios administrativos do sistema.

| Campo             | Tipo      | Descricao                          |
|-------------------|-----------|------------------------------------|
| id                | UUID      | Identificador unico                |
| email             | string    | Email (unico)                      |
| password_hash     | string    | Hash Argon2id                      |
| name              | string    | Nome de exibicao                   |
| role_id           | UUID      | FK para roles                      |
| is_active         | boolean   | Se o usuario esta ativo            |
| last_login_at     | timestamp | Ultimo login                       |
| created_at        | timestamp | Criacao                            |
| updated_at        | timestamp | Ultima atualizacao                 |

#### roles

Perfis de acesso ao sistema.

| Campo       | Tipo      | Descricao                          |
|-------------|-----------|------------------------------------|
| id          | UUID      | Identificador unico                |
| name        | string    | Nome do perfil (owner, admin, etc) |
| description | string    | Descricao                          |
| is_system   | boolean   | Se e um perfil de sistema          |
| created_at  | timestamp | Criacao                            |

Perfis previstos: owner, admin, operator, analyst, read_only

#### permissions

Permissoes granulares atribuidas a perfis.

| Campo      | Tipo   | Descricao                              |
|------------|--------|----------------------------------------|
| id         | UUID   | Identificador unico                    |
| role_id    | UUID   | FK para roles                          |
| resource   | string | Recurso (campaigns, contacts, etc)     |
| action     | string | Acao (create, read, update, delete)     |

#### sessions

Sessoes de autenticacao ativas.

| Campo        | Tipo      | Descricao                          |
|--------------|-----------|------------------------------------|
| id           | UUID      | Identificador unico                |
| user_id      | UUID      | FK para admin_users                |
| token_hash   | string    | Hash do token de sessao            |
| ip_address   | string    | IP de origem                       |
| user_agent   | string    | User agent do navegador            |
| expires_at   | timestamp | Expiracao                          |
| created_at   | timestamp | Criacao                            |

### Contatos

#### contacts

Contatos globais do sistema. Um por numero de telefone.

| Campo              | Tipo      | Descricao                          |
|--------------------|-----------|------------------------------------|
| id                 | UUID      | Identificador unico                |
| phone              | string    | Numero de telefone (E.164, unico)  |
| name               | string    | Nome do contato                    |
| normalized_phone   | string    | Telefone normalizado para busca    |
| first_seen_at      | timestamp | Primeira vez visto no sistema      |
| last_seen_at       | timestamp | Ultima interacao                   |
| total_participations | int     | Contador de participacoes          |
| total_purchases    | int       | Contador de compras                |
| is_student         | boolean   | Se ja comprou algum produto        |
| metadata           | jsonb     | Dados adicionais                   |
| created_at         | timestamp | Criacao                            |
| updated_at         | timestamp | Ultima atualizacao                 |

#### contact_identifiers

Identificadores alternativos do contato (email, WhatsApp ID, etc).

| Campo      | Tipo      | Descricao                          |
|------------|-----------|------------------------------------|
| id         | UUID      | Identificador unico                |
| contact_id | UUID      | FK para contacts                   |
| type       | enum      | Tipo (phone, email, whatsapp_id)   |
| value      | string    | Valor do identificador             |
| verified   | boolean   | Se foi verificado                  |
| created_at | timestamp | Criacao                            |

### Campanhas

#### campaigns

Campanhas de lancamento.

| Campo          | Tipo      | Descricao                          |
|----------------|-----------|------------------------------------|
| id             | UUID      | Identificador unico                |
| name           | string    | Nome da campanha                   |
| slug           | string    | Slug unico para URLs               |
| status         | enum      | draft, active, paused, completed   |
| cart_open_day  | enum      | Dia de abertura (default: wednesday)|
| starts_at      | timestamp | Inicio da campanha                 |
| ends_at        | timestamp | Fim da campanha                    |
| created_by     | UUID      | FK para admin_users                |
| created_at     | timestamp | Criacao                            |
| updated_at     | timestamp | Ultima atualizacao                 |

#### campaign_versions

Versoes de configuracao de uma campanha.

| Campo        | Tipo      | Descricao                          |
|--------------|-----------|------------------------------------|
| id           | UUID      | Identificador unico                |
| campaign_id  | UUID      | FK para campaigns                  |
| version      | int       | Numero da versao                   |
| config       | jsonb     | Configuracao desta versao          |
| published_at | timestamp | Quando foi publicada               |
| created_at   | timestamp | Criacao                            |

#### campaign_participations

Participacao de um contato em uma campanha especifica.

| Campo            | Tipo      | Descricao                          |
|------------------|-----------|------------------------------------|
| id               | UUID      | Identificador unico                |
| contact_id       | UUID      | FK para contacts                   |
| campaign_id      | UUID      | FK para campaigns                  |
| classification   | enum      | new, returning, veteran, student   |
| status           | enum      | active, completed, dropped         |
| group_id         | UUID      | FK para groups (nullable)          |
| diagnosed_at     | timestamp | Quando foi classificado            |
| flow_step        | string    | Step atual do fluxo                |
| metadata         | jsonb     | Dados adicionais da participacao   |
| created_at       | timestamp | Criacao                            |
| updated_at       | timestamp | Ultima atualizacao                 |

Constraint unico: (contact_id, campaign_id)

### Grupos WhatsApp

#### groups

Grupos vinculados a campanhas.

| Campo          | Tipo      | Descricao                          |
|----------------|-----------|------------------------------------|
| id             | UUID      | Identificador unico                |
| campaign_id    | UUID      | FK para campaigns                  |
| whatsapp_id    | string    | ID do grupo no WhatsApp            |
| name           | string    | Nome do grupo                      |
| category       | enum      | Categoria de lead que o grupo atende|
| capacity       | int       | Limite maximo de membros           |
| current_count  | int       | Contagem atual (projecao)          |
| is_active      | boolean   | Se esta ativo                      |
| created_at     | timestamp | Criacao                            |
| updated_at     | timestamp | Ultima atualizacao                 |

#### group_memberships

Estado atual de membros em grupos (projecao derivada de eventos).

| Campo      | Tipo      | Descricao                          |
|------------|-----------|------------------------------------|
| id         | UUID      | Identificador unico                |
| group_id   | UUID      | FK para groups                     |
| contact_id | UUID      | FK para contacts                   |
| joined_at  | timestamp | Quando entrou                      |
| left_at    | timestamp | Quando saiu (nullable)             |
| is_active  | boolean   | Se esta ativo no grupo             |
| created_at | timestamp | Criacao                            |

#### group_events

Eventos imutaveis de entrada/saida em grupos.

| Campo           | Tipo      | Descricao                          |
|-----------------|-----------|------------------------------------|
| id              | UUID      | Identificador unico                |
| group_id        | UUID      | FK para groups                     |
| contact_id      | UUID      | FK para contacts                   |
| event_type      | enum      | join, leave, removed               |
| whatsapp_event_id | string  | ID do evento no WhatsApp Manager   |
| raw_payload     | jsonb     | Payload original do evento         |
| occurred_at     | timestamp | Quando o evento ocorreu            |
| processed_at    | timestamp | Quando foi processado              |
| created_at      | timestamp | Criacao                            |

### Processamento de eventos

#### integration_cursors

Cursores de polling para integracao com WhatsApp Manager.

| Campo          | Tipo      | Descricao                          |
|----------------|-----------|------------------------------------|
| id             | UUID      | Identificador unico                |
| integration    | string    | Nome da integracao                 |
| cursor         | string    | Cursor atual                       |
| last_polled_at | timestamp | Ultimo polling                     |
| updated_at     | timestamp | Ultima atualizacao                 |

#### processed_events

Registro de eventos ja processados (idempotencia).

| Campo             | Tipo      | Descricao                          |
|-------------------|-----------|------------------------------------|
| id                | UUID      | Identificador unico                |
| event_source      | string    | Origem (whatsapp_manager, eduzz)   |
| external_event_id | string    | ID externo do evento               |
| event_type        | string    | Tipo do evento                     |
| processed_at      | timestamp | Quando foi processado              |
| result            | string    | Resultado do processamento         |

Constraint unico: (event_source, external_event_id)

### Atribuicao e rastreamento

#### lead_attributions

Origem de cada lead (como chegou ao sistema).

| Campo            | Tipo      | Descricao                          |
|------------------|-----------|------------------------------------|
| id               | UUID      | Identificador unico                |
| participation_id | UUID      | FK para campaign_participations    |
| source           | string    | Fonte (link, organic, referral)    |
| medium           | string    | Meio                               |
| campaign_ref     | string    | Referencia da campanha             |
| landing_url      | string    | URL de chegada                     |
| created_at       | timestamp | Criacao                            |

#### tracking_clicks

Cliques em links rastreados.

| Campo      | Tipo      | Descricao                          |
|------------|-----------|------------------------------------|
| id         | UUID      | Identificador unico                |
| contact_id | UUID      | FK para contacts (nullable)        |
| url        | string    | URL clicada                        |
| referer    | string    | Referrer                           |
| ip_address | string    | IP de origem                       |
| user_agent | string    | User agent                         |
| created_at | timestamp | Criacao                            |

### Conversas e mensagens

#### conversations

Conversas entre o sistema e contatos.

| Campo            | Tipo      | Descricao                          |
|------------------|-----------|------------------------------------|
| id               | UUID      | Identificador unico                |
| contact_id       | UUID      | FK para contacts                   |
| participation_id | UUID      | FK para campaign_participations    |
| status           | enum      | active, waiting, closed            |
| assigned_to      | UUID      | FK para admin_users (nullable)     |
| started_at       | timestamp | Inicio                             |
| closed_at        | timestamp | Encerramento (nullable)            |
| created_at       | timestamp | Criacao                            |

#### conversation_messages

Mensagens individuais em uma conversa.

| Campo           | Tipo      | Descricao                          |
|-----------------|-----------|------------------------------------|
| id              | UUID      | Identificador unico                |
| conversation_id | UUID      | FK para conversations              |
| direction       | enum      | inbound, outbound                  |
| content         | text      | Conteudo da mensagem               |
| message_type    | enum      | text, template, button_response    |
| template_id     | UUID      | FK para message_templates (nullable)|
| sent_at         | timestamp | Quando foi enviada                 |
| delivered_at    | timestamp | Quando foi entregue (nullable)     |
| read_at         | timestamp | Quando foi lida (nullable)         |
| created_at      | timestamp | Criacao                            |

#### message_templates

Templates de mensagem reutilizaveis.

| Campo      | Tipo      | Descricao                          |
|------------|-----------|------------------------------------|
| id         | UUID      | Identificador unico                |
| name       | string    | Nome interno                       |
| category   | string    | Categoria (greeting, follow_up)    |
| is_active  | boolean   | Se esta ativo                      |
| created_by | UUID      | FK para admin_users                |
| created_at | timestamp | Criacao                            |
| updated_at | timestamp | Ultima atualizacao                 |

#### message_template_versions

Versoes de templates (permite A/B testing).

| Campo       | Tipo      | Descricao                          |
|-------------|-----------|------------------------------------|
| id          | UUID      | Identificador unico                |
| template_id | UUID      | FK para message_templates          |
| version     | int       | Numero da versao                   |
| content     | text      | Conteudo do template               |
| variables   | jsonb     | Variaveis disponiveis              |
| is_current  | boolean   | Se e a versao atual                |
| created_at  | timestamp | Criacao                            |

### Fluxos de conversa

#### flow_definitions

Definicoes de fluxos de conversa.

| Campo       | Tipo      | Descricao                          |
|-------------|-----------|------------------------------------|
| id          | UUID      | Identificador unico                |
| name        | string    | Nome do fluxo                      |
| description | string    | Descricao                          |
| trigger     | enum      | Gatilho (on_join, on_message, etc) |
| is_active   | boolean   | Se esta ativo                      |
| created_by  | UUID      | FK para admin_users                |
| created_at  | timestamp | Criacao                            |
| updated_at  | timestamp | Ultima atualizacao                 |

#### flow_versions

Versoes de um fluxo.

| Campo       | Tipo      | Descricao                          |
|-------------|-----------|------------------------------------|
| id          | UUID      | Identificador unico                |
| flow_id     | UUID      | FK para flow_definitions           |
| version     | int       | Numero da versao                   |
| is_published| boolean   | Se esta publicada                  |
| published_at| timestamp | Quando foi publicada               |
| created_at  | timestamp | Criacao                            |

#### flow_steps

Steps individuais de um fluxo.

| Campo          | Tipo      | Descricao                          |
|----------------|-----------|------------------------------------|
| id             | UUID      | Identificador unico                |
| flow_version_id| UUID      | FK para flow_versions              |
| order          | int       | Ordem no fluxo                     |
| step_type      | enum      | message, wait, condition, action   |
| config         | jsonb     | Configuracao do step               |
| template_id    | UUID      | FK para message_templates (nullable)|
| next_step_id   | UUID      | FK para flow_steps (nullable)      |
| created_at     | timestamp | Criacao                            |

#### flow_buttons

Botoes de resposta em um step.

| Campo     | Tipo   | Descricao                          |
|-----------|--------|------------------------------------|
| id        | UUID   | Identificador unico                |
| step_id   | UUID   | FK para flow_steps                 |
| label     | string | Texto do botao                     |
| value     | string | Valor enviado ao clicar            |
| next_step_id | UUID | FK para flow_steps (nullable)    |
| order     | int    | Ordem de exibicao                  |

### Classificacao e diagnostico

#### diagnoses

Diagnosticos de veteranos (gerados por IA).

| Campo            | Tipo      | Descricao                          |
|------------------|-----------|------------------------------------|
| id               | UUID      | Identificador unico                |
| participation_id | UUID      | FK para campaign_participations    |
| contact_id       | UUID      | FK para contacts                   |
| provider         | string    | Provedor (xai, grok)              |
| prompt_hash      | string    | Hash do prompt usado               |
| input_summary    | jsonb     | Resumo dos dados de entrada        |
| diagnosis        | text      | Diagnostico gerado                 |
| recommendations  | jsonb     | Recomendacoes                      |
| tokens_used      | int       | Tokens consumidos                  |
| latency_ms       | int       | Latencia da chamada                |
| created_at       | timestamp | Criacao                            |

#### human_handoffs

Encaminhamentos para atendimento humano.

| Campo            | Tipo      | Descricao                          |
|------------------|-----------|------------------------------------|
| id               | UUID      | Identificador unico                |
| conversation_id  | UUID      | FK para conversations              |
| assigned_to      | UUID      | FK para admin_users                |
| reason           | string    | Motivo do encaminhamento           |
| status           | enum      | pending, active, resolved          |
| resolved_at      | timestamp | Quando foi resolvido               |
| created_at       | timestamp | Criacao                            |

### Compras e reembolsos

#### student_statuses

Historico de status de aluno de um contato.

| Campo      | Tipo      | Descricao                          |
|------------|-----------|------------------------------------|
| id         | UUID      | Identificador unico                |
| contact_id | UUID      | FK para contacts                   |
| status     | enum      | active, churned, refunded          |
| product_id | string    | ID do produto                      |
| changed_at | timestamp | Quando o status mudou              |
| created_at | timestamp | Criacao                            |

#### purchases

Compras confirmadas.

| Campo            | Tipo      | Descricao                          |
|------------------|-----------|------------------------------------|
| id               | UUID      | Identificador unico                |
| contact_id       | UUID      | FK para contacts                   |
| participation_id | UUID      | FK para campaign_participations    |
| external_id      | string    | ID na plataforma (Eduzz)           |
| platform         | string    | Plataforma (eduzz)                 |
| product_id       | string    | ID do produto                      |
| product_name     | string    | Nome do produto                    |
| amount_cents     | int       | Valor em centavos                  |
| currency         | string    | Moeda (BRL)                        |
| purchased_at     | timestamp | Data da compra                     |
| created_at       | timestamp | Criacao                            |

#### refunds

Reembolsos processados.

| Campo        | Tipo      | Descricao                          |
|--------------|-----------|------------------------------------|
| id           | UUID      | Identificador unico                |
| purchase_id  | UUID      | FK para purchases                  |
| external_id  | string    | ID do reembolso na plataforma      |
| reason       | string    | Motivo                             |
| refunded_at  | timestamp | Data do reembolso                  |
| created_at   | timestamp | Criacao                            |

### Integracoes

#### integration_connections

Conexoes com servicos externos.

| Campo            | Tipo      | Descricao                          |
|------------------|-----------|------------------------------------|
| id               | UUID      | Identificador unico                |
| provider         | string    | Provedor (whatsapp_manager, eduzz) |
| status           | enum      | active, inactive, error            |
| config           | jsonb     | Configuracao (criptografada)       |
| credentials_enc  | bytea     | Credenciais criptografadas         |
| last_health_at   | timestamp | Ultimo health check                |
| error_message    | string    | Ultima mensagem de erro            |
| created_at       | timestamp | Criacao                            |
| updated_at       | timestamp | Ultima atualizacao                 |

#### integration_logs

Logs de chamadas a integracao.

| Campo         | Tipo      | Descricao                          |
|---------------|-----------|------------------------------------|
| id            | UUID      | Identificador unico                |
| provider      | string    | Provedor                           |
| endpoint      | string    | Endpoint chamado                   |
| method        | string    | Metodo HTTP                        |
| status_code   | int       | Codigo de resposta                 |
| request_body  | jsonb     | Body da requisicao (redacted)      |
| response_body | jsonb     | Body da resposta (redacted)        |
| latency_ms    | int       | Latencia                           |
| error         | string    | Mensagem de erro (nullable)        |
| created_at    | timestamp | Criacao                            |

### IA e conhecimento

#### knowledge_documents

Documentos de base de conhecimento para IA.

| Campo      | Tipo      | Descricao                          |
|------------|-----------|------------------------------------|
| id         | UUID      | Identificador unico                |
| title      | string    | Titulo                             |
| content    | text      | Conteudo                           |
| category   | string    | Categoria                          |
| is_active  | boolean   | Se esta ativo                      |
| created_by | UUID      | FK para admin_users                |
| created_at | timestamp | Criacao                            |
| updated_at | timestamp | Ultima atualizacao                 |

#### ai_configs

Configuracoes do provedor de IA.

| Campo      | Tipo      | Descricao                          |
|------------|-----------|------------------------------------|
| id         | UUID      | Identificador unico                |
| provider   | string    | Provedor (xai)                     |
| model      | string    | Modelo (grok-2)                    |
| config     | jsonb     | Parametros (temperature, etc)      |
| is_active  | boolean   | Se esta ativo                      |
| created_at | timestamp | Criacao                            |
| updated_at | timestamp | Ultima atualizacao                 |

### Importacao

#### imports

Importacoes em massa de dados.

| Campo         | Tipo      | Descricao                          |
|---------------|-----------|------------------------------------|
| id            | UUID      | Identificador unico                |
| type          | enum      | contacts, participations           |
| status        | enum      | pending, processing, done, failed  |
| filename      | string    | Nome do arquivo                    |
| total_rows    | int       | Total de linhas                    |
| processed_rows| int       | Linhas processadas                 |
| error_rows    | int       | Linhas com erro                    |
| created_by    | UUID      | FK para admin_users                |
| started_at    | timestamp | Inicio do processamento            |
| completed_at  | timestamp | Fim do processamento               |
| created_at    | timestamp | Criacao                            |

#### import_rows

Linhas individuais de uma importacao.

| Campo     | Tipo      | Descricao                          |
|-----------|-----------|------------------------------------|
| id        | UUID      | Identificador unico                |
| import_id | UUID      | FK para imports                    |
| row_number| int       | Numero da linha                    |
| data      | jsonb     | Dados da linha                     |
| status    | enum      | pending, success, error            |
| error     | string    | Mensagem de erro (nullable)        |
| created_at| timestamp | Criacao                            |

### Auditoria e sistema

#### audit_logs

Registro de acoes administrativas.

| Campo       | Tipo      | Descricao                          |
|-------------|-----------|------------------------------------|
| id          | UUID      | Identificador unico                |
| user_id     | UUID      | FK para admin_users                |
| action      | string    | Acao realizada                     |
| resource    | string    | Recurso afetado                    |
| resource_id | UUID      | ID do recurso                      |
| old_value   | jsonb     | Valor anterior (nullable)          |
| new_value   | jsonb     | Novo valor (nullable)              |
| ip_address  | string    | IP de origem                       |
| user_agent  | string    | User agent                         |
| created_at  | timestamp | Criacao                            |

#### system_settings

Configuracoes globais do sistema.

| Campo      | Tipo      | Descricao                          |
|------------|-----------|------------------------------------|
| id         | UUID      | Identificador unico                |
| key        | string    | Chave (unica)                      |
| value      | jsonb     | Valor                              |
| description| string    | Descricao                          |
| updated_by | UUID      | FK para admin_users                |
| updated_at | timestamp | Ultima atualizacao                 |

## Relacionamentos chave

### Contato -> Participacoes

Um contato pode ter multiplas participacoes (uma por campanha). A
classificacao e armazenada na participacao, nao no contato, porque
o mesmo contato pode ser "novo" na campanha A e "recorrente" na B.

### Campanha -> Grupos

Uma campanha pode ter multiplos grupos, cada um com categoria e
capacidade definidas. Grupos sao preenchidos por ordem de capacidade.

### Eventos -> Projecoes

`group_events` sao imutaveis. `group_memberships` e `groups.current_count`
sao projecoes derivadas dos eventos. Em caso de inconsistencia, os
eventos sao a fonte de verdade.

### Participacao -> Fluxo

Cada participacao pode estar em um step de um fluxo de conversa. O
fluxo determina quais mensagens enviar e quais botoes apresentar.

## Indices recomendados

- `contacts.phone` (unico)
- `contacts.normalized_phone` (busca)
- `campaign_participations(contact_id, campaign_id)` (unico)
- `group_events.whatsapp_event_id` (unico)
- `processed_events(event_source, external_event_id)` (unico)
- `group_memberships(group_id, contact_id)` (busca)
- `audit_logs.created_at` (ordenacao)
- `conversations(contact_id, status)` (busca)

## Nota

Este e um modelo conceitual. O schema Prisma sera criado na Etapa 02
com base neste documento, incluindo tipos exatos, constraints, indices
e validacoes.
