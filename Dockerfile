# Build stage: compile TypeScript with dev dependencies available.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage: production dependencies only. glibc-based image so sqlite3
# uses its prebuilt linux/arm64 binary instead of compiling from source.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# SQLite database (movies + Trakt tokens) lives on a mounted volume.
ENV DB_NAME=/data/movies.db
VOLUME ["/data"]

CMD ["node", "dist/daemon.js"]
