# syntax=docker/dockerfile:1

ARG NODE_VERSION=20

# ---------------------------------------------------------------------------
# Build stage: install all dependencies and compile TypeScript to dist/.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /usr/src/app

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage: production dependencies and the compiled output only.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine

# Use production node environment by default.
ENV NODE_ENV production

RUN apk add --no-cache curl

WORKDIR /usr/src/app

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY package.json ./
COPY --from=build /usr/src/app/dist ./dist

# Run the application as a non-root user.
USER node

EXPOSE 5000

CMD ["node", "dist/server.js"]
