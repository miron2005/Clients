FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache bash openssl

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3001
CMD ["bash", "-lc", "npm run start:dev"]

