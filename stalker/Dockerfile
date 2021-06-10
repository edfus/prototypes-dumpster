FROM node:16-alpine
COPY --chown=node:node . /app
WORKDIR /app

RUN chmod -R 765 /app/
RUN /app/setup.sh

USER node
ENV STALKER_BASIC_INFO_PATH=
ENV STALKER_CREDENTIALS_PATH=

ENTRYPOINT [ "node", "index.js" ]