FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache bash

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["bash", "-lc", "npm run dev"]

