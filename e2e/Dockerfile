FROM node:24-bookworm-slim

WORKDIR /work

COPY package.json package-lock.json ./
RUN npm ci \
    && npx playwright install --with-deps --only-shell chromium \
    && npm cache clean --force

COPY playwright.config.js ./
COPY tests ./tests

CMD ["npx", "playwright", "test"]
