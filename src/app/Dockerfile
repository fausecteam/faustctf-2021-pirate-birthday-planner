FROM node
WORKDIR /usr/src/app
COPY package*.json ./

RUN npm install

COPY *.js ./
COPY public ./public
COPY views ./views

EXPOSE 8080
CMD [ "node", "server.js" ]
