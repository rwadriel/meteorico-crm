# Dados privados e carga real

## Regra

Os VCFs e CSVs reais de contatos contêm dados pessoais. Eles não devem ser versionados no GitHub nem ficar dentro do kit de desenvolvimento.

## Desenvolvimento

Use somente:
- `dados/carga_inicial_EXEMPLO_FICTICIO.csv`
- `dados/participacoes_por_campanha_EXEMPLO_FICTICIO.csv`

## Carga real

Depois de a Etapa 04 estar aprovada:
1. Faça deploy em staging.
2. Entre no painel com usuário autorizado.
3. Abra **Importações**.
4. Faça upload do CSV real de contatos e do histórico por campanha.
5. Revise a prévia, duplicidades, campanhas e linhas rejeitadas.
6. Confirme a importação.
7. Confira os totais no dashboard e em amostra manual.
8. Se tudo estiver correto, faça a mesma carga em produção no momento definido.

## Dados históricos desta operação

Na carga preparada pelo proprietário, os números presentes nos rótulos históricos, por exemplo `ML Grupo 27`, `ML Grupo 39` e `Ml 40`, representam o **número da campanha histórica**. A importação deve tratá-los como referência de edição e resolver a campanha interna correspondente.

Nunca usar esses rótulos como nome pessoal do contato.
