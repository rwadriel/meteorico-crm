#!/bin/sh
set -eu

n8n import:workflow --separate --input=/opt/meteorico/workflows

for workflow_id in \
  meteoricoWaSend \
  meteoricoWaStatus \
  meteoricoWaInbound \
  meteoricoWaRetry
do
  n8n publish:workflow --id="$workflow_id"
done

exec /docker-entrypoint.sh start
