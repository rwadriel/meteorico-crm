# ADR-0001: Monorepo com pnpm e TypeScript

## Status

Aceita

## Data

2026-08-07

## Contexto

O Meteorico CRM e composto por multiplos componentes que compartilham
codigo: frontend (React), API (Fastify), worker (BullMQ) e pacotes de
dominio, banco, utilitarios e UI. Precisamos decidir como organizar o
codigo-fonte e qual runtime/linguagem usar.

### Requisitos

1. Compartilhamento de codigo entre API, worker e frontend (tipos,
   validacoes, logica de dominio)
2. Build unico e consistente
3. Desenvolvedores trabalham em um unico repositorio
4. Compatibilidade com ferramentas modernas (Vitest, Vite, Prisma)
5. Tipagem estatica para reduzir erros em runtime

### Restricoes

- Equipe pequena (1-3 desenvolvedores)
- Familiaridade com ecossistema Node.js/TypeScript
- Deploy via Docker no EasyPanel

## Decisao

Adotar **pnpm workspaces** como gerenciador de monorepo com
**TypeScript** como linguagem principal em todos os pacotes.

### Estrutura

```
meteorico-crm/
├── apps/
│   ├── web/       (React + Vite)
│   ├── api/       (Fastify)
│   └── worker/    (BullMQ)
├── packages/
│   ├── domain/    (logica pura)
│   ├── database/  (Prisma)
│   ├── shared/    (tipos, utils)
│   └── ui/        (componentes React)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

### Configuracao

- `pnpm-workspace.yaml` define os workspaces
- `tsconfig.base.json` com configuracao TypeScript base
- Cada pacote tem seu `tsconfig.json` que estende o base
- Dependencias entre pacotes via `workspace:*`

## Consequencias

### Positivas

- **Compartilhamento de tipos**: Tipos definidos em `packages/shared`
  sao usados por API, worker e frontend sem duplicacao
- **Logica de dominio reutilizavel**: `packages/domain` e usado por
  API e worker sem copia
- **Refatoracao segura**: Mudancas em tipos compartilhados sao
  verificadas em todos os consumidores em tempo de compilacao
- **Uma unica arvore de dependencias**: pnpm deduplica pacotes,
  reduzindo tamanho de `node_modules`
- **Simplicidade operacional**: Um repositorio, um CI, um deploy

### Negativas

- **Complexidade de configuracao**: Monorepo requer configuracao
  adicional de TypeScript (project references ou paths)
- **Build pode ser lento**: Mudancas em pacotes compartilhados
  requerem rebuild de consumidores
- **Docker build mais complexo**: Precisa copiar todo o monorepo
  para builds multi-stage

### Neutras

- **pnpm e menos popular que npm/yarn**: Mas esta crescendo e tem
  suporte adequado de ferramentas

## Alternativas consideradas

### 1. npm workspaces

- **Pro**: Nativo no Node.js, sem dependencia adicional
- **Contra**: Hoisting agressivo causa problemas com Prisma e pacotes
  nativos. Sem suporte a `workspace:*` protocol ate recentemente.
  Gerenciamento de lockfile menos eficiente.
- **Motivo da rejeicao**: pnpm tem melhor isolamento de dependencias
  e e mais rapido para install

### 2. Turborepo

- **Pro**: Cache de builds, execucao paralela otimizada, bom DX
- **Contra**: Adiciona uma camada de complexidade. Para um projeto
  com 3-4 apps e 4 pacotes, o overhead de configuracao nao se
  justifica. pnpm scripts + filtering ja atendem.
- **Motivo da rejeicao**: Over-engineering para o tamanho atual do
  projeto. Pode ser adotado no futuro se o monorepo crescer.

### 3. Repositorios separados

- **Pro**: Isolamento total, deploys independentes
- **Contra**: Compartilhamento de tipos requer pacote publicado no
  npm (ou registry privado). Sincronizacao de versoes e manual.
  Mudancas que afetam multiplos repos requerem PRs coordenados.
- **Motivo da rejeicao**: Complexidade operacional desproporcional
  para equipe pequena. O beneficio de isolamento nao compensa o
  custo de coordenacao.

### 4. Nx

- **Pro**: Ferramentas avancadas de monorepo, cache, graph de
  dependencias, generators
- **Contra**: Curva de aprendizado alta, muito opinativo, adiciona
  muita configuracao para um projeto deste tamanho.
- **Motivo da rejeicao**: Mesmo raciocinio do Turborepo - complexidade
  injustificada para o escopo atual.

## Referencias

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
