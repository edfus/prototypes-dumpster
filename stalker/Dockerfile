FROM node:16-alpine
COPY . /app
WORKDIR /app
RUN /app/setup.sh
ENV STALKER_BASIC_INFO_PATH=
ENV STALKER_CREDENTIALS_PATH=

ENTRYPOINT [ "node", "index.js" ]