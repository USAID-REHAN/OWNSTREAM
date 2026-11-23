# apps/server/Dockerfile
# Build from the repository root: docker build -f apps/server/Dockerfile .
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w packages/shared
RUN npm run build -w apps/server

FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/server/package.json apps/server/package.json
COPY --from=build /repo/apps/server/dist apps/server/dist
RUN npm ci --omit=dev
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/main.js"]
