# Passo a passo de execução - Meteórico CRM V3

## O que enviar para a IA
Envie **somente** `METEORICO_CRM_KIT_DESENVOLVIMENTO_V3.zip` no início.

Não envie a carga real de contatos para construir o sistema. A carga privada entra pelo painel depois da Etapa 04.

## Ordem

### Preparação
1. Crie/indique um repositório GitHub privado.
2. Dê à IA acesso ao repositório e terminal.
3. Configure GitHub como integração ou secret `GITHUB_TOKEN` fora do chat.
4. Envie o kit de desenvolvimento.
5. Abra e cole o conteúdo de `prompts/00_PROMPT_INICIAL.md`.
6. Aguarde a confirmação de acesso e não permita código ainda.

### Etapa 01
1. Abra `prompts/01_ETAPA_01.md`.
2. Copie o bloco `text` inteiro.
3. Substitua apenas placeholders como URL do repositório/branch base.
4. Cole na IA.
5. Espere a implementação terminar.
6. Confira lint, typecheck, testes, build, documentação, branch e commit.
7. Se houver falha, mande corrigir a mesma etapa.
8. Se estiver aprovado, use `prompts/00_LIBERAR_PROXIMA_ETAPA.md`.

### Etapas 02 a 10
Repita exatamente o mesmo procedimento, usando o arquivo da etapa seguinte.

| Etapa | Prompt | Branch | Foco |
|---|---|---|---|
| 01 | `01_ETAPA_01.md` | `phase/01-foundation` | Fundação, arquitetura, CI, containers |
| 02 | `02_ETAPA_02.md` | `phase/02-data-security` | Banco, auth, RBAC, auditoria |
| 03 | `03_ETAPA_03.md` | `phase/03-dashboard-ui` | Design system e painel |
| 04 | `04_ETAPA_04.md` | `phase/04-campaigns-imports` | Campanhas, grupos, importação segura |
| 05 | `05_ETAPA_05.md` | `phase/05-group-events` | API de entradas/saídas dos grupos |
| 06 | `06_ETAPA_06.md` | `phase/06-whatsapp-attribution` | WhatsApp privado e origem do tráfego |
| 07 | `07_ETAPA_07.md` | `phase/07-classification` | Classificação e histórico/aluno |
| 08 | `08_ETAPA_08.md` | `phase/08-flows-ai` | Mensagens, botões, fluxos e Grok |
| 09 | `09_ETAPA_09.md` | `phase/09-analytics` | Dashboards, Eduzz, Meta, relatórios |
| 10 | `10_ETAPA_10.md` | `phase/10-release` | Auditoria, staging, EasyPanel e produção |

## Carga real
Depois da Etapa 04 aprovada:
1. Faça deploy em staging.
2. Entre no painel protegido.
3. Faça upload do `carga_inicial_contatos.csv` do pacote privado.
4. Faça upload do `participacoes_por_campanha.csv`.
5. Revise a prévia e linhas rejeitadas.
6. Confirme a importação.
7. Compare os totais com `resumo_por_campanha.csv` e a planilha XLSX.
8. Não faça commit desses arquivos.

## Campanhas históricas
Nos dados históricos fornecidos, números em rótulos como `ML Grupo 27`, `ML Grupo 39` e `Ml 40` representam o número da campanha correspondente. O importador deve mapear esse número para a campanha interna e nunca usar o rótulo como nome pessoal.

## Secrets
Nunca cole valores de secrets. Use apenas nomes de variáveis como `GITHUB_TOKEN`, `XAI_API_KEY`, `EDUZZ_CLIENT_SECRET`, `WHATSAPP_API_TOKEN` etc.

## Regra para liberar próxima etapa
Não escreva apenas “continue”. Primeiro aprove explicitamente a etapa anterior, faça a IA reler `PROJECT_STATE` e depois cole o prompt da próxima etapa.
