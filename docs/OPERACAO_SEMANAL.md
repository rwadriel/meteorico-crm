# Manual de Operacao Semanal - Meteorico CRM

## Ciclo Semanal de Campanha

### Segunda-feira: Preparacao
1. Criar nova campanha no painel (nome, slug, edicao)
2. Criar grupos: novo, reparticipante, veterano, aluno, geral
3. Definir capacidade de cada grupo (padrao 256)
4. Configurar invite links dos grupos no WhatsApp
5. Duplicar templates de mensagem da campanha anterior (se aplicavel)

### Terca-feira: Configuracao
1. Revisar templates de mensagem
2. Configurar redirect links (URLs de checkout com UTM)
3. Revisar base de conhecimento (FAQ, objecoes)
4. Configurar fluxo de boas-vindas (se diferente do padrao)
5. Ativar campanha (status: draft -> active)

### Quarta-feira: Abertura do Carrinho
1. Verificar que campanha esta ativa
2. Monitorar dashboard da campanha em tempo real
3. Verificar que novos contatos estao sendo classificados
4. Monitorar grupos (fill rate, entradas)
5. Verificar que links de redirect estao funcionando

### Quinta a Sabado: Operacao
1. Monitorar dashboard global e por campanha
2. Verificar diagnosticos de veteranos (se IA ativa)
3. Atender handoffs humanos (fila de transferencias)
4. Monitorar compras e reembolsos no dashboard
5. Verificar que worker esta processando eventos

### Domingo: Encerramento
1. Completar campanha (status: active -> completed)
2. Exportar CSV da campanha (para arquivo)
3. Revisar metricas finais: participacoes, compras, receita, conversao
4. Comparar com campanha anterior
5. Anotar licoes aprendidas

## Tarefas de Manutencao

### Diarias
- Verificar health checks (api, worker, postgres, redis)
- Verificar que worker esta processando eventos
- Verificar dashboard para anomalias

### Semanais
- Revisar audit logs para atividades suspeitas
- Verificar espaco em disco do banco
- Limpar sessoes expiradas

### Mensais
- Limpar audit_logs > 90 dias
- Limpar processed_events > 30 dias
- Revisar e atualizar base de conhecimento
- Atualizar templates de mensagem se necessario
- Verificar e renovar backups

## Importacao de Contatos

1. Preparar CSV com colunas: phone, name (opcional)
2. Telefones no formato BR (11 digitos sem +55, ou 13 com +55)
3. Upload via painel: Importacoes -> Upload
4. Revisar preview antes de confirmar
5. Confirmar importacao
6. Verificar que contatos foram classificados

## Diagnostico de Problemas Comuns

| Problema | Causa provavel | Solucao |
|----------|----------------|---------|
| Contato nao classificado | Campanha nao ativa | Ativar campanha |
| Grupo lotado | Capacidade atingida | Criar grupo adicional |
| Worker parado | Conexao com WM API | Verificar token e URL |
| Dashboard vazio | Sem dados no periodo | Ajustar filtro de data |
| Login falha | Sessao expirada | Refazer login |
| Webhook nao processa | Evento duplicado | Verificar processed_events |
