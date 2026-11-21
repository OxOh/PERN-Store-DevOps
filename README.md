# PERN Store — DevSecOps Edition
![CI](https://github.com/OxOh/PERN-Store-DevOps/actions/workflows/ci.yml/badge.svg)

A full-stack e-commerce app (PostgreSQL, Express, React, Node.js), used as the base for building a DevSecOps pipeline: hardened containers, CI, security scanning and AWS deployment.

> Based on [PERN-Store](https://github.com/dhatGuy/PERN-Store) by @dhatGuy. The application code is theirs; the infrastructure, pipeline and security work in this repo is mine.

## What I added

- [x] Local setup fixes: configurable API URL, documented environment and database setup
- [x] Fixed backend dev script so NODE_ENV=development actually applies
- [x] Fixed the broken test suite: missing Jest dependency, a schema bug that blocked deleting users, an outdated assertion, and new product tests
- [x] Review and harden the existing Docker Compose setup (localhost binding, non-root containers, no secrets in the compose file)
- [x] GitHub Actions CI: lint, test against Postgres, build client and Docker images
- [ ] Security scanning: SonarCloud, npm audit / Trivy, Gitleaks
- [ ] AWS deployment with secrets managed outside the repo

## Tech stack

React (Vite) · Node.js / Express · PostgreSQL · Docker · GitHub Actions · AWS

## Running with Docker (recommended)

```bash
cp server/.env.example server/.env    # set a strong POSTGRES_PASSWORD first
docker compose up -d --build
```
App: http://localhost:3000. Only the frontend is published, on `127.0.0.1`. The API sits behind nginx at `/api`, and PostgreSQL runs on an internal network with no host port and no internet access. The schema loads automatically on first start, and all containers run as non-root users.

Frontend build variables (`VITE_GOOGLE_CLIENT_ID`, `VITE_STRIPE_PUB_KEY`, `VITE_PAYSTACK_PUB_KEY`) go in a root `.env` file. These end up in the browser bundle, so only public keys belong there.

## Running locally

Requirements: Node.js and Docker.

1. Start PostgreSQL, bound to localhost only:
   ```bash
   docker run -d --name pernstore-db -p 127.0.0.1:5432:5432 \
     -e POSTGRES_PASSWORD=newpassword -e POSTGRES_DB=pernstore postgres:16
   ```
2. Load the schema:
   ```bash
   docker exec -i pernstore-db psql -U postgres -d pernstore < SCHEMA_FILE
   ```
3. Start the backend (API on http://localhost:8080):
   ```bash
   cd server
   cp .env.example .env
   npm install
   npm run dev
   ```
4. Start the frontend (app on http://localhost:3000):
   ```bash
   cd client
   npm install
   npm run dev
   ```

## Security notes

- Secrets live in `server/.env`, which is git-ignored. `.env.example` contains placeholders only.
- The dev servers and the database bind to `127.0.0.1`, so nothing is exposed to the local network.
