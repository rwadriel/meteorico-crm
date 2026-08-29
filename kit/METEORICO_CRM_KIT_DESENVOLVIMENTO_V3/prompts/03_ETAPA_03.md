# Etapa 03 - 3 - Design system e painel administrativo base

## Como usar

1. Leia `../00_COMECE_AQUI.md`.
2. Confirme que a etapa anterior foi aprovada.
3. Dê à IA acesso ao repositório e aos arquivos indicados no manual.
4. Cole apenas o bloco de prompt abaixo.
5. Não coloque tokens no chat; use secrets/variáveis do ambiente.
6. Só avance após testes, commit e relatório final.

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
