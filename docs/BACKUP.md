# Backup e restauração

O PostgreSQL e o n8n usam volumes persistentes no EasyPanel. Redeploy da aplicação não remove esses volumes.

## Política

- backup lógico diário do banco, preferencialmente às `02:00` no horário do servidor;
- retenção mínima de 14 cópias;
- destino remoto exclusivo para `zapgrupos/meteorico-crm`;
- execução manual e validação do primeiro backup;
- teste periódico de restauração em banco não produtivo.

## EasyPanel

1. Abra o PostgreSQL do CRM.
2. Entre em **Backups**.
3. Selecione o provedor remoto já configurado no servidor.
4. Crie a agenda `0 2 * * *` e retenção 14.
5. Execute **Manual Run**.
6. Confirme o arquivo e o log de sucesso no destino.

Uma restauração substitui dados e é destrutiva. Antes de restaurar, pause campanhas, faça uma cópia de segurança atual, valide o serviço e o arquivo exatos e teste fora de produção.
