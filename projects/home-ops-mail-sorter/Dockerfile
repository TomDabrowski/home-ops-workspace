FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY data ./data
COPY src ./src
COPY tests ./tests
COPY tsconfig.json ./
COPY README.md ./

CMD ["npm", "run", "suggest:accounts", "--", "data/accounts.json"]
