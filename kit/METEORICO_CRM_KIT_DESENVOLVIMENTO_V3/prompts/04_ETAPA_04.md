# Etapa 04 - Campanhas, grupos, versões e importação inicial

## Como usar

1. Leia `../00_COMECE_AQUI.md` e `00_INSTRUCOES_FIXAS.md`.
2. Confirme que a Etapa 03 foi aprovada em `docs/PROJECT_STATE.md`.
3. Dê à IA acesso ao repositório e somente aos arquivos fictícios desta etapa.
4. Cole apenas o bloco de prompt abaixo.
5. **Não anexe a carga real de clientes para desenvolver o importador.** Use os exemplos fictícios em `dados/`.
6. A carga real será feita manualmente, pelo painel protegido, depois que todos os testes desta etapa passarem.

```text
Leia `README.md`, toda a documentação em `/docs` e principalmente `docs/PROJECT_STATE.md`. Execute somente a Etapa 04.

REPOSITÓRIO: {{REPOSITORY_URL}}
BRANCH BASE: branch aprovada da Etapa 03
BRANCH DESTA ETAPA: phase/04-campaigns-imports

OBJETIVO:
Entregar o núcleo operacional do painel: campanhas semanais, grupos, versões de configuração e importação histórica segura.

REGRA CENTRAL:
O contato é global. Participações, grupos, mensagens, origem, compra e demais fatos comerciais ficam vinculados à campanha. O número histórico de campanha (por exemplo 24, 27, 39, 40) é uma referência de edição, não o UUID interno do banco.

ESCOPO DE CAMPANHAS:
- CRUD seguro;
- rascunho, ativa, encerrada, histórica/importada e arquivada;
- duplicação com incremento do número da edição;
- sugestão de datas +7 dias;
- quarta-feira como padrão configurável, nunca regra oculta;
- validações antes de ativar;
- apenas uma campanha principal ativa, salvo configuração futura explícita;
- histórico e auditoria;
- versões publicadas imutáveis;
- campanhas históricas importadas podem existir sem datas quando a data real é desconhecida: nunca inventar datas.

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
- upload CSV somente por usuário autorizado;
- preview antes de persistir;
- mapeamento de colunas;
- validação e normalização de telefone;
- relatório de erros e linhas rejeitadas;
- idempotência;
- upsert seguro;
- regras de precedência;
- auditoria;
- identificador do lote;
- desfazer lote quando tecnicamente seguro;
- arquivos temporários com retenção curta e acesso protegido;
- nunca registrar telefone completo, conteúdo do CSV ou dados pessoais em logs de aplicação.

ARQUIVO 1 - CONTATOS:
Use para testes `dados/carga_inicial_EXEMPLO_FICTICIO.csv`.
Cabeçalho suportado:
telefone,nome,email,quantidade_participacoes,ultima_edicao,aluno,produto,origem,data_primeiro_contato,data_ultimo_contato,observacoes

ARQUIVO 2 - HISTÓRICO POR CAMPANHA:
Use para testes `dados/participacoes_por_campanha_EXEMPLO_FICTICIO.csv`.
Cabeçalho suportado:
telefone,campanha,aluno_atual,status_na_campanha,marcado_saiu,rotulos_vcard,origem

REGRAS DO HISTÓRICO:
- o campo `campanha` é o número histórico confirmado da edição;
- ao importar, resolver ou criar a campanha histórica por número, sem inventar data;
- um `telefone + campanha` só pode produzir uma participação histórica confirmada;
- duplicatas da mesma campanha não aumentam a contagem;
- `quantidade_participacoes` pode ser derivada do número de campanhas históricas distintas quando o arquivo de histórico estiver presente;
- `ultima_edicao` pode ser derivada do maior número de campanha histórica confirmado;
- uma classificação `aluno=sim` prevalece sobre `nao` quando fontes confiáveis conflitam, sem apagar o histórico anterior;
- `marcado_saiu=sim` é um fato do histórico e não apaga a participação;
- `rotulos_vcard` é somente auditoria/origem e nunca deve virar nome pessoal automaticamente;
- dados desconhecidos permanecem nulos/desconhecidos; nunca assumir zero ou falso sem evidência;
- alterações manuais posteriores devem ser auditadas.

DADOS REAIS:
Não faça commit de VCF, CSV ou planilha de contatos reais. O repositório deve conter apenas exemplos fictícios. Depois da aprovação da Etapa 04, o proprietário fará upload da carga real pelo painel em ambiente protegido. A aplicação deve oferecer uma tela de prévia e confirmação antes da importação real.

TESTES OBRIGATÓRIOS:
- duplicação semanal;
- ativação incompleta bloqueada;
- grupos por segmento, limite e prioridade;
- CSV de contatos válido, inválido, duplicado e grande;
- CSV histórico válido, campanhas repetidas e telefone em campanhas diferentes;
- criação de campanha histórica sem data inventada;
- aluno prevalece em conflito;
- rótulo de VCard não é usado como nome pessoal;
- reimportação idempotente do mesmo lote;
- rollback seguro de lote;
- permissões e auditoria;
- tentativa de path traversal / fórmula CSV / conteúdo malicioso;
- E2E das telas;
- regressão das Etapas 01-03.

CRITÉRIOS DE ACEITE:
- usuário consegue criar a próxima campanha sem código;
- consegue cadastrar links e groupIds;
- consegue importar os exemplos fictícios com preview e relatório;
- histórico telefone + campanha fica íntegro;
- nenhuma data ou participação é inventada;
- dados reais não são necessários para os testes de desenvolvimento;
- todos os testes, lint, typecheck e build passam;
- documentação e PROJECT_STATE atualizados;
- commit e push realizados somente após sucesso.

Commit final sugerido: feat: add campaign operations groups and safe historical imports
```
