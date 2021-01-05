FROM node:12-alpine

WORKDIR /usr/src/forbidden

RUN apk add --no-cache python make gcc g++

COPY ./package*.json ./

RUN npm install -g gulp && npm install

COPY . .

RUN gulp

EXPOSE 8080
CMD [ "node", "index.js"]
