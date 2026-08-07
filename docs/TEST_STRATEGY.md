# Estrategia de Testes - Meteorico CRM

## Visao geral

O projeto adota uma estrategia de testes em piramide com tres niveis
principais: unitarios, integracao e end-to-end (E2E). Testes de contrato
complementam a estrategia para integracoes externas.

```
         /  E2E  \          Playwright (poucos, lentos, alto valor)
        /----------\
       / Integracao \        Vitest + PostgreSQL container
      /--------------\
     /   Unitarios    \      Vitest (muitos, rapidos, baixo custo)
    /------------------\
   /    Contrato        \    Vitest (validam interfaces de integracao)
  /______________________\
```

## Metas de cobertura

| Camada         | Meta    | Ferramenta              |
|----------------|---------|-------------------------|
| Unitarios      | >= 80%  | Vitest                  |
| Integracao     | >= 60%  | Vitest + testcontainers |
| E2E            | Fluxos criticos | Playwright       |
| Contrato       | 100% das interfaces | Vitest         |

A meta global e >= 75% de cobertura de linhas.

## Testes unitarios

### Ferramenta

Vitest (compativel com Jest, mais rapido, nativo em ESM).

### O que testar

- **packages/domain**: TODA a logica de negocio
  - Motor de classificacao de leads
  - Regras de capacidade de grupos
  - Maquinas de estado de campanhas
  - Validacoes de negocio
  - Value objects (Phone, Email, etc)

- **apps/api**: Logica de services (sem I/O)
  - Transformacoes de dados
  - Validacoes de schemas Zod
  - Funcoes utilitarias

- **apps/worker**: Logica de processamento
  - Parsing de eventos
  - Decisoes de roteamento
  - Regras de retry

### O que NAO testar unitariamente

- Controllers (testados via integracao)
- Queries SQL/Prisma (testadas via integracao)
- Componentes React simples (testados via E2E)

### Convencoes

- Arquivos de teste ao lado do codigo: `foo.ts` -> `foo.test.ts`
- Describe blocks por funcao/metodo
- Nomes descritivos: `it('should classify contact as returning when has 1 previous participation')`
- Arrange-Act-Assert
- Sem mocks de dependencias internas (apenas de I/O)

### Exemplo

```typescript
// packages/domain/classification/classify.test.ts
import { describe, it, expect } from 'vitest'
import { classifyLead } from './classify'

describe('classifyLead', () => {
  it('should return NEW when contact has no previous participations', () => {
    const result = classifyLead({
      previousParticipations: 0,
      hasPurchase: false,
    })
    expect(result).toBe('new')
  })

  it('should return STUDENT when contact has a purchase', () => {
    const result = classifyLead({
      previousParticipations: 5,
      hasPurchase: true,
    })
    expect(result).toBe('student')
  })

  it('should return VETERAN when 3+ participations without purchase', () => {
    const result = classifyLead({
      previousParticipations: 3,
      hasPurchase: false,
    })
    expect(result).toBe('veteran')
  })
})
```

## Testes de integracao

### Ferramenta

Vitest com PostgreSQL e Redis em containers Docker (testcontainers ou
docker-compose para testes).

### Pre-requisitos

- Docker instalado e rodando
- Variaveis de ambiente de teste configuradas

### O que testar

- **Repositories**: Queries Prisma contra PostgreSQL real
  - CRUD de contatos
  - Queries complexas (busca, filtros, paginacao)
  - Constraints (unique, foreign keys)
  - Transacoes

- **API routes**: Request -> Response completo
  - Validacao de entrada
  - Autenticacao e autorizacao
  - Respostas corretas (status codes, body)
  - Tratamento de erros

- **Workers**: Processamento completo de eventos
  - Consumo de fila -> processamento -> persistencia
  - Idempotencia
  - Retry e dead-letter

### Setup

```typescript
// test/setup-integration.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaClient } from '@prisma/client'

let container: StartedPostgreSqlContainer
let prisma: PrismaClient

beforeAll(async () => {
  container = await new PostgreSqlContainer().start()
  process.env.DATABASE_URL = container.getConnectionUri()
  prisma = new PrismaClient()
  await prisma.$executeRaw`-- run migrations`
}, 60_000) // container pode demorar

afterAll(async () => {
  await prisma.$disconnect()
  await container.stop()
})

beforeEach(async () => {
  // Limpar tabelas entre testes
  await prisma.$executeRaw`TRUNCATE TABLE ... CASCADE`
})
```

### Convencoes

- Arquivos: `foo.integration.test.ts`
- Cada teste cria seus proprios dados (nao depende de seed)
- Transacoes sao rollbackadas quando possivel
- Timeouts maiores (30s+) para setup de container

## Testes E2E

### Ferramenta

Playwright.

### O que testar

Fluxos criticos do usuario, de ponta a ponta:

1. **Login e autenticacao**
   - Login com credenciais validas
   - Login com credenciais invalidas
   - Logout
   - Sessao expirada

2. **Gestao de campanhas**
   - Criar campanha
   - Editar campanha
   - Ativar/pausar campanha
   - Visualizar dashboard de campanha

3. **Visualizacao de contatos**
   - Listar contatos
   - Filtrar por classificacao
   - Ver detalhes do contato
   - Ver historico de participacoes

4. **Fluxo de lead (simulado)**
   - Evento de entrada no grupo (via mock)
   - Classificacao automatica
   - Visualizacao no dashboard

### Setup

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

### Convencoes

- Arquivos: `e2e/nome-do-fluxo.spec.ts`
- Page Objects para encapsular seletores
- Dados de teste criados via API (nao via UI)
- Screenshots em caso de falha

## Testes de contrato

### Proposito

Validar que as interfaces de integracao (ports) sao respeitadas tanto
pelos adapters reais quanto pelos mocks. Isso garante que os mocks
usados em testes unitarios refletem o comportamento real.

### O que testar

Para cada integracao (WhatsApp Manager, Eduzz, xAI):

1. **Schema de resposta**: A resposta do adapter real segue o tipo
   TypeScript definido na interface
2. **Mock fidelidade**: O mock retorna dados no mesmo formato que o
   adapter real retornaria
3. **Casos de erro**: Ambos (real e mock) lidam com erros da mesma forma

### Exemplo

```typescript
// packages/domain/ports/__tests__/whatsapp-events.contract.test.ts
import { describe, it, expect } from 'vitest'
import { WhatsAppEventsPort } from '../WhatsAppEventsPort'

// Testes que validam qualquer implementacao da interface
export function testWhatsAppEventsContract(
  createAdapter: () => WhatsAppEventsPort
) {
  describe('WhatsAppEventsPort contract', () => {
    it('should return events with valid structure', async () => {
      const adapter = createAdapter()
      const result = await adapter.getEvents({ limit: 10 })

      expect(result).toHaveProperty('events')
      expect(result).toHaveProperty('next_cursor')
      expect(result).toHaveProperty('has_more')
      expect(Array.isArray(result.events)).toBe(true)
    })

    it('should return health status', async () => {
      const adapter = createAdapter()
      const health = await adapter.healthCheck()

      expect(health).toHaveProperty('status')
      expect(['ok', 'degraded', 'down']).toContain(health.status)
    })
  })
}
```

## Execucao

### Comandos

```bash
# Todos os testes unitarios
pnpm test

# Testes unitarios com watch
pnpm test:watch

# Testes de integracao (requer Docker)
pnpm test:integration

# Testes E2E (requer app rodando)
pnpm test:e2e

# Cobertura
pnpm test:coverage

# Testes de um pacote especifico
pnpm --filter @meteorico/domain test
pnpm --filter @meteorico/api test
```

### CI/CD

```yaml
# Ordem de execucao no CI
1. Lint (eslint, prettier)
2. Type check (tsc --noEmit)
3. Testes unitarios
4. Testes de integracao (com Docker)
5. Build
6. Testes E2E (contra build)
7. Upload de cobertura
```

### Politica de merge

- Todos os testes unitarios devem passar
- Testes de integracao devem passar
- Cobertura nao pode diminuir (ratchet)
- Testes E2E devem passar para deploy em producao

## Dados de teste

### Factories

Usar factory functions para criar dados de teste:

```typescript
// test/factories/contact.ts
export function createContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: randomUUID(),
    phone: '+5511999999999',
    name: 'Teste',
    firstSeenAt: new Date(),
    totalParticipations: 0,
    totalPurchases: 0,
    isStudent: false,
    ...overrides,
  }
}
```

### Seeds

Seeds para desenvolvimento local (nao para testes):

```
packages/database/seed/
  seed.ts           # Seed principal
  contacts.ts       # Contatos de exemplo
  campaigns.ts      # Campanhas de exemplo
  groups.ts         # Grupos de exemplo
```

## Riscos e mitigacoes

| Risco                              | Mitigacao                           |
|------------------------------------|-------------------------------------|
| Docker nao disponivel no dev       | Testes de integracao opcionais local|
| Testes E2E flakey                  | Retries no CI, screenshots de falha|
| Cobertura artificial (testes ruins)| Code review de testes               |
| Testes lentos                      | Paralelismo, containers compartilhados|
| Dados de teste inconsistentes      | Factories com defaults sensiveis    |
