# Meteorico CRM - Resumo do Projeto

## O que e

Meteorico e um CRM especializado em lancamentos semanais via WhatsApp.
O sistema captura leads que iniciam conversas no WhatsApp, classifica-os
automaticamente (novo, recorrente, veterano, aluno) e os distribui em
grupos segmentados por campanha, respeitando limites de capacidade.

## Por que

Lancamentos semanais geram volume alto de leads em janelas curtas (abertura
de carrinho as quartas-feiras). A classificacao manual e inviavel nessa
escala, e a falta de historico entre campanhas desperdia oportunidades de
personalizacao. O sistema resolve isso com um motor de classificacao
deterministico que considera o historico completo do contato.

## Para quem

Equipes de lancamento digital que operam ciclos semanais de venda via
WhatsApp, com grupos segmentados por perfil de lead.

## Modelo de dados central

### Contato global

Cada numero de telefone gera um unico registro de contato no sistema.
Esse contato e global - nao pertence a nenhuma campanha especifica.

### Participacao em campanhas

O mesmo contato pode participar de multiplas campanhas ao longo do tempo.
Cada participacao registra o perfil classificado, o grupo atribuido e o
historico de interacoes daquela campanha especifica.

Essa separacao permite:

- Rastrear a evolucao do lead entre campanhas
- Classificar com base no historico completo (nao apenas da campanha atual)
- Manter dados limpos sem duplicacao de contatos

## Funcionalidades principais

### Classificacao automatica de leads

Motor deterministico que classifica leads em quatro categorias:

| Categoria   | Criterio                                           |
|-------------|-----------------------------------------------------|
| Novo        | Primeiro contato, nunca participou de campanha       |
| Recorrente  | Ja participou de campanha anterior, nao comprou      |
| Veterano    | Participou de 3+ campanhas sem compra               |
| Aluno       | Tem pelo menos uma compra confirmada                 |

A classificacao e deterministica para novo, recorrente e aluno. Para
veteranos, o sistema utiliza IA (xAI/Grok) para diagnostico personalizado.

### Gestao de campanhas semanais

- Criacao e configuracao de campanhas com abertura de carrinho semanal
- Versionamento de campanhas (mesma campanha pode ter versoes diferentes)
- Fluxos de conversa configuraveis por categoria de lead

### Gestao de grupos WhatsApp

- Grupos vinculados a campanhas com limites de capacidade
- Monitoramento de entradas e saidas via WhatsApp Manager API (somente leitura)
- Redistribuicao automatica quando grupos atingem capacidade

### Fluxos de conversa

- Fluxos configuraveis com steps, botoes e templates de mensagem
- Personalizacao por categoria de lead
- Encaminhamento para atendimento humano quando necessario

### Integracao com plataformas de venda

- Confirmacao de compras via Eduzz (futuro)
- Atualizacao automatica do status do contato apos compra

### Dashboard e relatorios

- Visao geral por campanha
- Metricas de conversao por categoria de lead
- Acompanhamento em tempo real de grupos

## Regras de negocio fundamentais

1. Um contato = um numero de telefone. Sem duplicatas.
2. A classificacao depende do historico completo do contato, nao apenas da campanha atual.
3. Grupos tem limite de capacidade. O sistema nunca distribui alem do limite.
4. Eventos de grupo (entrada/saida) sao imutaveis. O estado atual e derivado.
5. Abertura de carrinho ocorre as quartas-feiras.
6. IA e usada apenas para diagnostico de veteranos. Todo o resto e deterministico.
7. WhatsApp Manager API e somente leitura - o sistema observa, nao controla grupos.

## Stack tecnica

- **Monorepo**: TypeScript, pnpm workspaces
- **Frontend**: React + Vite
- **API**: Fastify
- **Worker**: Processo dedicado com BullMQ
- **Banco**: PostgreSQL
- **Cache/Filas**: Redis + BullMQ
- **ORM**: Prisma
- **Validacao**: Zod
- **Logs**: Pino
- **Testes**: Vitest (unit/integracao), Playwright (E2E)
- **Deploy**: Docker + EasyPanel em VPS

## Etapas do projeto

| Etapa | Descricao                          | Status       |
|-------|------------------------------------|--------------|
| 01    | Fundacao (monorepo, tooling, docs) | Em andamento |
| 02    | Schema e migracao                  | Pendente     |
| 03    | Dominio e classificacao            | Pendente     |
| 04    | API e integracao WhatsApp Manager  | Pendente     |
| 05    | Interface web                      | Pendente     |
| 06    | Fluxos de conversa                 | Pendente     |
| 07    | Integracoes externas               | Pendente     |
| 08    | Deploy e observabilidade           | Pendente     |
