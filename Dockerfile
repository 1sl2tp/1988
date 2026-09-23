FROM brainicism/bgutil-ytdlp-pot-provider:latest

COPY --chown=node:node backend/session-adapter.mjs /app/session-adapter.mjs
COPY --chown=node:node backend/start-session.sh /app/start-session.sh

EXPOSE 8080
ENTRYPOINT ["/bin/sh", "/app/start-session.sh"]
CMD []
