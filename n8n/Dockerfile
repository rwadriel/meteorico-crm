FROM n8nio/n8n:2.21.0

USER root
COPY n8n/workflows /opt/meteorico/workflows
COPY n8n/entrypoint.sh /opt/meteorico/entrypoint.sh
RUN chmod 0555 /opt/meteorico/entrypoint.sh
USER node

ENTRYPOINT ["tini", "--", "/opt/meteorico/entrypoint.sh"]
