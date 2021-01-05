FROM node:12-alpine

WORKDIR /usr/src/forbidden-server

COPY . .

RUN npm install

EXPOSE 8080
CMD [ "node", "index.js"]
