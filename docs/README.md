# PERN Store: DevSecOps on AWS

![CI](https://github.com/OxOh/PERN-Store-DevOps/actions/workflows/ci.yml/badge.svg)

A full-stack e-commerce app (PostgreSQL, Express, React, Node.js) taken from "it runs on my laptop" to a hardened, continuously deployed production setup on **AWS ECS Fargate**, with security checks at every stage of the pipeline.

> The application is based on [PERN-Store](https://github.com/dhatGuy/PERN-Store) by Joseph Odunsi. The application code is theirs. The infrastructure, pipeline, security hardening and the fixes listed below are my work.

## Highlights

- **124 → 0** HIGH/CRITICAL vulnerabilities in the container images (Trivy), by moving the server to a distroless runtime and patching the nginx base.
- **Zero stored cloud credentials**: GitHub Actions authenticates to AWS with short-lived OIDC tokens, scoped to this repository's `main` branch by immutable IDs.
- **Every push to `main`** is scanned for secrets, vulnerable dependencies, code issues and image vulnerabilities, tested against a real PostgreSQL, built, pushed and rolled out to Fargate, with automatic rollback if the new version is unhealthy.
- **Nothing but CloudFront is public**: the load balancer only accepts CloudFront traffic carrying a secret header, the app runs in private subnets, and the database subnets have no internet route at all.

## Architecture

![Architecture diagram](docs/architecture.png)

The diagram covers the delivery pipeline, the runtime architecture across two availability zones, the chained security groups and the local development setup. Its numbered steps (1–15) are explained in the panel on the right of the diagram.

Source: [`docs/architecture.drawio`](docs/architecture.drawio). Open it in [diagrams.net](https://app.diagrams.net) to edit, then export it to `docs/architecture.png` with **File → Export as → PNG**.

**Request path:** User → **CloudFront** (HTTPS) → **Application Load Balancer** (CloudFront only) → **ECS Fargate tasks** in private subnets → **RDS PostgreSQL** (TLS, verified certificate)

- The ALB routes `/api/*` to the server service and everything else to the client service (nginx serving the React build).
- Outbound calls (Stripe, Google, Gmail, AWS APIs) leave through a NAT gateway. ECR image layers come through a free S3 gateway endpoint.
- Secrets live in AWS Secrets Manager and are injected into the server container at startup.
- Container logs go to CloudWatch with 14-day retention.

## CI/CD pipeline

Defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Runs on every push and pull request; deployment runs only on `main`.

| Stage | What it does | Fails the build on |
|---|---|---|
| **Secrets** | Gitleaks over the full Git history | Any unreviewed secret |
| **Server** | `npm audit`, ESLint, Jest tests against a PostgreSQL service container | High/critical dependency CVEs, lint errors, failing tests |
| **Client** | `npm audit`, ESLint, production build | High/critical dependency CVEs, lint errors, build errors |
| **SonarQube Cloud** | Static analysis for bugs and security issues | (reported on the dashboard) |
| **Docker** | Builds both images, Trivy report and gate | Fixable critical image vulnerabilities |
| **Publish** | Pushes images tagged with the commit SHA to ECR via OIDC | (main only) |
| **Deploy** | Registers new task definition revisions, rolls out both services, verifies the new revision is running | Failed rollout or automatic rollback |

## Security controls

### Supply chain
- GitHub Actions pinned to **full commit SHAs**; CI images (Gitleaks, Trivy, PostgreSQL) pinned by **digest**.
- **Dependabot** keeps pins and dependencies current, with minor/patch updates grouped and major versions upgraded deliberately.
- `npm ci --ignore-scripts` everywhere: dependency install scripts are blocked, with one explicit exception (`npm rebuild bcrypt`).
- Images are tagged with the commit SHA in **immutable** ECR repositories, so a tag always means the same image.

### Identity and access
- **GitHub OIDC** instead of AWS access keys. The role's trust policy matches `repo:OxOh@<owner-id>/PERN-Store-DevOps@<repo-id>:ref:refs/heads/main`, so pull requests, other branches and re-created repositories with the same name cannot assume it.
- The CI role can push to two ECR repositories and update two ECS services. `iam:PassRole` is limited to the task execution role and to ECS tasks only.
- The ECS **execution role** can read exactly one secret. The app has **no task role**, so its own code holds no AWS permissions.

### Containers
- Server: **distroless** Node.js runtime (no shell, no package manager, no npm), running as UID 65532.
- Client: **nginx-unprivileged** on patched Alpine, running as UID 101.
- **Read-only root filesystem** for both. nginx gets a writable `/tmp` volume, prepared by a short-lived init container.
- Build context excludes `.env` files, so secrets never end up in image layers.

### Network
- Tasks run in **private subnets** without public IPs. Database subnets have **no route to the internet**.
- Security groups form a chain: ALB → tasks on 8080 → server only to RDS on 5432. The RDS security group has no outbound rules. Each group's outbound rules are as narrow as its inbound ones.
- The ALB accepts traffic only from the **CloudFront managed prefix list**, and its listener requires a secret `X-Origin-Verify` header (set on the CloudFront origin). Anything else gets `403`.
- CloudFront redirects HTTP to HTTPS.

### Data
- RDS encrypted at rest, deletion protection on.
- The server connects with TLS and **verifies the RDS certificate** against the bundled Amazon RDS CA (no `rejectUnauthorized: false`).
- Database password, JWT secrets and API keys come from Secrets Manager, never from the image or the repository.

## Design decisions and trade-offs

| Decision | Why | Trade-off / upgrade path |
|---|---|---|
| **Single-AZ RDS** | Cost, and the AWS free plan limits | A zone-a outage takes the app down. Converting to Multi-AZ later needs no app change: the endpoint stays the same, and the second DB subnet already exists for it. |
| **CloudFront default certificate** | HTTPS without owning a domain | Attaching a custom domain later only needs an ACM certificate on the same distribution. |
| **One NAT gateway** | A second one roughly doubles the fixed network cost | Outbound access depends on zone a. |
| **One task per service** | Cost; the single-AZ database limits availability anyway | Scaling out is a one-field change. |
| **1-day RDS backups** | Free plan limit | Production would keep 7+ days. |
| **No AWS WAF yet** | Fixed monthly cost for a demo project | Planned: monitor mode first, then rate limiting on the login endpoint. |
| **Init container runs as root** | Fargate creates volumes owned by root; nginx runs as UID 101 | It runs one fixed `chmod` and exits, a smaller exposure than a writable root filesystem. |

## Problems I ran into

**OIDC role denied with a "correct" trust policy.** Every console check passed, yet `AssumeRoleWithWebIdentity` kept failing. Decoding the token's claims in the pipeline showed GitHub's subject now includes **immutable owner and repository IDs** (`repo:OxOh@78442813/...`). Matching the trust policy to it also closed a repo-name squatting gap.

**Database "password authentication failed" no matter what password I set.** The secrets had been added to the task definition as plain **values** instead of **ValueFrom** references, so the app received the secret's ARN text as its password. An AI troubleshooting assistant correctly found this, but also recommended "fixing" the IAM resource by appending `-*` to the secret ARN, which would have broken a working permission, since the ARN already ended in its random suffix. Verifying advice against the actual ARN before applying it caught that.

**nginx crash-looping on a read-only filesystem.** `mkdir() "/tmp/proxy_temp" failed (13: Permission denied)`: the Fargate volume was root-owned while nginx runs unprivileged. Solved with an init container instead of giving up the read-only root filesystem.

**A test suite that had never been runnable.** Jest was missing from the original project, and once installed, 14 of 18 tests failed. The cause was a schema bug: `cart.user_id` was `NOT NULL` but its foreign key said `ON DELETE SET NULL`, so **deleting any user with a cart failed**, in tests and in the real app. Changed to `ON DELETE CASCADE`, updated an outdated assertion and added product tests: 20/20 passing, enforced in CI.

## Planned improvements

- **AWS WAF** in monitor mode, then rate limiting on `/api/auth/login`.
- **CloudFront VPC origin** with an internal ALB, removing the load balancer's public endpoint entirely.
- **Multi-AZ RDS** and a second task per service.
- **Infrastructure as code** (Terraform) for everything built manually in the console.
- A **least-privilege database user** for the app instead of the master user, and secret rotation with task restarts.
- A proper **migration tool** instead of the idempotent bootstrap script.

## Running locally

Requirements: Node.js 22 and Docker.

### With Docker (recommended)

```bash
cp server/.env.example server/.env    # set a strong POSTGRES_PASSWORD first
docker compose up -d --build
```

App: http://localhost:3000. Only the frontend is published, on `127.0.0.1`. The API sits behind nginx at `/api`, PostgreSQL runs on an internal network with no host port and no internet access, and the schema loads automatically on first start.

Frontend build variables (`VITE_GOOGLE_CLIENT_ID`, `VITE_STRIPE_PUB_KEY`, `VITE_PAYSTACK_PUB_KEY`) go in a root `.env` file. They end up in the browser bundle, so only public keys belong there.

### Without Docker

1. Start PostgreSQL, bound to localhost only:
   ```bash
   docker run -d --name pernstore-db -p 127.0.0.1:5432:5432 \
     -e POSTGRES_PASSWORD=newpassword -e POSTGRES_DB=pernstore postgres:16
   ```
2. Load the schema:
   ```bash
   docker exec -i pernstore-db psql -U postgres -d pernstore < server/config/init.sql
   ```
3. Start the backend (API on http://localhost:8080):
   ```bash
   cd server && cp .env.example .env && npm install && npm run dev
   ```
4. Start the frontend (app on http://localhost:3000):
   ```bash
   cd client && npm install && npm run dev
   ```

### Tests

```bash
docker exec pernstore-db createdb -U postgres pernstore_test
docker exec -i pernstore-db psql -U postgres -d pernstore_test < server/config/init.sql
cd server
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=postgres \
POSTGRES_PASSWORD=newpassword POSTGRES_DB_TEST=pernstore_test npm test
```

## Tech stack

React (Vite) · Node.js / Express · PostgreSQL · Docker · GitHub Actions · Gitleaks · Trivy · SonarQube Cloud · Dependabot · AWS (ECS Fargate, ECR, RDS, ALB, CloudFront, Secrets Manager, CloudWatch, IAM OIDC)
