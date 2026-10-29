# Golden Hour: a self-contained image for helplines, NGOs or anyone who wants to run their own copy.
#   docker build -t golden-hour .
#   docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... golden-hour      (the key is optional)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# the phone-line relay (same image, started with: node voice/relay.mjs) and its one dependency
COPY --from=build --chown=app:app /app/voice ./voice
COPY --from=deps /app/node_modules/ws ./node_modules/ws
# phone cases (kept 30 days) live in a volume mounted here
RUN mkdir -p /data/cases && chown -R app:app /data
ENV DATA_DIR=/data/cases
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
