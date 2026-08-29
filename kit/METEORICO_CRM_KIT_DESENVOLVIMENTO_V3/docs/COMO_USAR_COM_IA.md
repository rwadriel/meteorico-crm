# Como executar o projeto com uma IA de programação - V3

## Material enviado à IA
A IA recebe o kit de desenvolvimento e acesso ao repositório. Dados pessoais reais ficam em pacote separado e não são necessários para escrever/testar o código.

A IA precisa ter acesso a:
- terminal;
- repositório Git privado;
- arquivos deste kit;
- Node/Docker/testes;
- secrets configurados fora da conversa.

## Início
1. Envie o kit de desenvolvimento.
2. Cole `prompts/00_PROMPT_INICIAL.md`.
3. Espere a IA confirmar acesso e leitura.
4. Cole o prompt da Etapa 01.

## Para cada etapa
1. Leia `docs/PROJECT_STATE.md` do repositório atual.
2. Leia `prompts/00_INSTRUCOES_FIXAS.md`.
3. Disponibilize somente os materiais específicos da etapa.
4. Cole o prompt correspondente.
5. Não permita avanço automático para a etapa seguinte.
6. Exija instalação/testes/build/checks específicos.
7. Revise relatório, commit e branch.
8. Se houver falha, corrija a etapa atual.
9. Se estiver aprovada, use `prompts/00_LIBERAR_PROXIMA_ETAPA.md` e só então cole o próximo prompt.

## Dados reais
Para desenvolver o importador da Etapa 04, use apenas exemplos fictícios em `dados/`. A carga privada é importada pelo painel protegido depois que o módulo estiver aprovado. VCFs e CSVs reais não devem ir para Git.

## Tokens e chaves
O prompt pode citar nomes como `GITHUB_TOKEN` e `XAI_API_KEY`, mas nunca seus valores. O ambiente de execução injeta os secrets.

## Continuidade
A fonte de verdade é o repositório: código, migrations, ADRs, testes e `docs/PROJECT_STATE.md`. Não dependa da memória da conversa anterior.
