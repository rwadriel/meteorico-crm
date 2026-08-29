# COMECE AQUI - Meteórico CRM V3

Este kit é o material que pode ser entregue à IA de programação. Ele foi separado da carga real de contatos por segurança.

## Você terá dois pacotes

1. **METEORICO_CRM_KIT_DESENVOLVIMENTO_V3.zip** - documentação, prompts, integrações, referências e exemplos fictícios. Pode ser usado pela IA de programação.
2. **CARGA_INICIAL_PRIVADA_V2_NAO_COMMITAR.zip** - contatos reais e histórico por campanha. Não deve ser commitado nem usado para desenvolver. Só importe pelo painel protegido depois da Etapa 04.

## Ordem exata

1. Leia `manual/GUIA_MESTRE_V3.pdf`.
2. Crie/indique um repositório GitHub privado.
3. Dê à IA acesso ao repositório e terminal.
4. Configure autenticação Git como secret/integrador. Não cole token no prompt.
5. Envie apenas o kit de desenvolvimento para a IA.
6. Cole `prompts/00_PROMPT_INICIAL.md` e espere a confirmação.
7. Abra `prompts/01_ETAPA_01.md`, copie todo o bloco de prompt e cole na IA.
8. Ao final, confira testes + commit + PROJECT_STATE.
9. Se houver falha, corrija a mesma etapa. Não avance.
10. Se estiver aprovado, use `prompts/00_LIBERAR_PROXIMA_ETAPA.md` e depois cole o prompt da etapa seguinte.
11. Repita até a Etapa 10.
12. A carga real é feita pelo painel após o importador da Etapa 04 ser aprovado; nunca pelo Git.
13. Produção somente na Etapa 10, sempre após staging.

## Regra central do sistema

O contato é global e único, mas cada fato comercial deve estar vinculado à campanha correspondente. Um mesmo contato pode participar de várias campanhas sem ser duplicado no CRM.

## Segurança

Não colocar em Git, prompts ou logs:
- tokens e chaves;
- senhas;
- VCFs de clientes;
- CSVs reais de contatos;
- exports da Eduzz com dados pessoais.

Use exemplos fictícios para desenvolver e a interface protegida do sistema para carregar dados reais.
