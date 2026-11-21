FROM node:22.23.2-trixie-slim AS build
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit
COPY . .

FROM gcr.io/distroless/nodejs22-debian13:nonroot
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app ./
EXPOSE 8080
CMD ["index.js"]
