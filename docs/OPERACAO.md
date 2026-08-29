# Como enviar uma campanha

## Como cadastrar um template

1. Abra **Templates**.
2. Clique em **Novo template**.
3. Informe um nome técnico em minúsculas, usando sublinhados.
4. Escolha a categoria solicitada: **Marketing** ou **Utility**.
5. Escreva o corpo e use `{{1}}`, `{{2}}` para valores variáveis.
6. Preencha um exemplo realista para cada variável.
7. Compare a categoria solicitada com a categoria sugerida pelo CRM.
8. Revise a prévia e clique em **Enviar para aprovação**.
9. Use **Sincronizar com a Meta** para atualizar aprovação, rejeição, qualidade e categoria final.

O CRM faz uma recomendação conservadora, mas a decisão final é da Meta. Um template só aparece na criação de campanhas depois que a Meta o marcar como **Aprovado**.

**Utility** deve estar ligado a uma transação, conta, agendamento ou solicitação que o cliente já iniciou. Ofertas, divulgação, engajamento, urgência ou textos mistos devem ser tratados como **Marketing**. Autenticação usa o formato próprio da Meta e não deve ser simulada como Utility.

## Como enviar uma campanha

1. Abra o CRM e entre com sua conta.
2. Vá em **Importar CSV**.
3. Escolha o arquivo `.csv`.
4. Confira válidos, duplicados e inválidos.
5. Confirme a importação.
6. Vá em **Follow-up WhatsApp**.
7. Clique em **Nova campanha**.
8. Escolha o template.
9. Preencha os valores de `{{1}}`, `{{2}}` solicitados pelo template.
10. Execute **Modo Teste**.
11. Confira elegíveis e excluídos.
12. Clique em **Iniciar campanha** e confirme.
13. Acompanhe o progresso na mesma tela.

## Proteções automáticas

- compradores não recebem follow-up;
- opt-outs nunca voltam à fila automaticamente;
- um contato só entra uma vez em cada campanha;
- uma falha individual não interrompe os demais envios;
- `SAIR`, `PARAR`, `CANCELAR`, `REMOVER` e `NÃO QUERO` bloqueiam novos envios;
- **Pausar** impede que novos lotes sejam processados; **Continuar** retoma a fila.

Nunca envie um teste para a lista completa. Use apenas o número de teste oficial da Meta ou um número explicitamente autorizado.
