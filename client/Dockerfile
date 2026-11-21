FROM node:22.12-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --legacy-peer-deps --ignore-scripts
COPY . .
ARG VITE_API_URL=/api
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_STRIPE_PUB_KEY
ARG VITE_PAYSTACK_PUB_KEY
ENV VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_STRIPE_PUB_KEY=$VITE_STRIPE_PUB_KEY \
    VITE_PAYSTACK_PUB_KEY=$VITE_PAYSTACK_PUB_KEY
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
USER root
RUN apk upgrade --no-cache
USER 101
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080