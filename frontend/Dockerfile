FROM node:20-alpine

WORKDIR /code

COPY package*.json ./
RUN npm ci

COPY --chown=node:node . .

USER node

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
