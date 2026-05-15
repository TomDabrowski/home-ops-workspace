FROM node:25-bookworm-slim

WORKDIR /app

COPY .deploy-deps/home-ops-framework /home-ops-framework
COPY package.json package-lock.json ./
RUN mkdir -p node_modules/@home-ops \
  && ln -s /home-ops-framework node_modules/@home-ops/framework

COPY app ./app
COPY deploy ./deploy
COPY dist ./dist
COPY docs ./docs
COPY scripts ./scripts
COPY src ./src
COPY README.md STATUS.md TODO.md tsconfig.json config.server.example.json ./

ENV NODE_ENV=production
ENV HOME_OPS_FINANCE_HOST=0.0.0.0
ENV HOME_OPS_FINANCE_SERVER_MODE=1
ENV PORT=4310
ENV HOME_OPS_FINANCE_DATA_DIR=/data

EXPOSE 4310

CMD ["npm", "run", "serve:app"]
