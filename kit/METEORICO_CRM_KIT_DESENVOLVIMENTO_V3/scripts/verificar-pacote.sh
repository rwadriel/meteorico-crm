#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
required=(
  "$ROOT/README.md"
  "$ROOT/00_COMECE_AQUI.md"
  "$ROOT/PASSO_A_PASSO_EXECUCAO_V3.md"
  "$ROOT/manual/GUIA_MESTRE_V3.pdf"
  "$ROOT/prompts/00_PROMPT_INICIAL.md"
  "$ROOT/prompts/00_INSTRUCOES_FIXAS.md"
  "$ROOT/prompts/01_ETAPA_01.md"
  "$ROOT/prompts/10_ETAPA_10.md"
  "$ROOT/integracoes/whatsapp-manager-api-kit.zip"
  "$ROOT/referencias/dashboard-dark-lime-referencia.png"
  "$ROOT/dados/carga_inicial_EXEMPLO_FICTICIO.csv"
  "$ROOT/dados/participacoes_por_campanha_EXEMPLO_FICTICIO.csv"
  "$ROOT/templates/.env.example"
)
for f in "${required[@]}"; do
  test -s "$f" || { echo "Arquivo ausente ou vazio: $f"; exit 1; }
done
for secret_file in $(find "$ROOT/dados" -type f \( -iname '*.vcf' -o -iname '*real*.csv' \) 2>/dev/null); do
  echo "Dado privado inesperado no kit: $secret_file"; exit 1
done
echo "Pacote V3 validado: arquivos essenciais presentes e nenhum VCF em dados/."
