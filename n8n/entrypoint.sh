#!/bin/sh
set -eu

case "${N8N_INTERNAL_TOKEN:-}" in
  '')
    echo "N8N_INTERNAL_TOKEN is required" >&2
    exit 1
    ;;
  *[!A-Za-z0-9._~-]*)
    echo "N8N_INTERNAL_TOKEN contains unsupported characters" >&2
    exit 1
    ;;
esac

umask 077
credential_file="$(mktemp /tmp/meteorico-credentials.XXXXXX)"
trap 'rm -f "$credential_file"' EXIT HUP INT TERM
cat >"$credential_file" <<EOF
[
  {
    "id": "meteoricoInternalApi",
    "name": "Meteorico Internal API",
    "type": "httpHeaderAuth",
    "data": {
      "name": "X-Internal-Token",
      "value": "${N8N_INTERNAL_TOKEN}"
    }
  }
]
EOF

n8n import:credentials --input="$credential_file"
rm -f "$credential_file"
trap - EXIT HUP INT TERM

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
