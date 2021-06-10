FROM node:16-alpine
COPY --chown=node:node . /app
WORKDIR /app

RUN chmod -R 765 /app/
RUN /app/setup.sh

USER node

ENTRYPOINT [ "/app/entry.sh", "node", "index.js" ]