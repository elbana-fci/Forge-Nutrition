# Deploy FORGE on Coolify

This Dockerfile runs the full React + Express + Prisma app, including accounts and the admin dashboard. It uses the existing SQLite schema, not PostgreSQL.

## Coolify settings

Commit these files and the application source to your Git repository. Create a Coolify application from that repository and choose **Dockerfile**.

| Setting | Value |
| --- | --- |
| Base directory | `/` (or the directory containing this package.json) |
| Dockerfile location | `/Dockerfile` |
| Ports Exposes | `3000` |
| Domain | Your HTTPS domain, routed to port 3000 |
| Persistent storage | Named volume `forge-data` mounted at `/data` |
| Replicas | `1` for SQLite |

No custom start/build command is needed. Do not mount a volume over `/app`; that hides the application files. Use `/data` for the database. A mounted volume survives redeploys; back it up separately.

## Runtime environment variables

Enter these in Coolify's environment settings (runtime variables, not build arguments):

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_URL=file:/data/forge.db
APP_URL=https://your-store.example.com
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=replace-with-a-unique-password-at-least-12-characters
SEED_ON_START=true
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

Replace APP_URL with the exact public origin, with no trailing slash. The request-origin check and Stripe redirects use this value. Do not upload a production `.env`; the image reads Coolify's injected environment.

The first boot applies the included initial Prisma migration and, with SEED_ON_START=true, adds the sample catalog and initial admin. After the successful first deployment, set SEED_ON_START=false and remove ADMIN_PASSWORD from the runtime settings, then redeploy. Seeding does not change an existing administrator's password. Use the account icon to sign in, then visit `/admin`.

The container prepares /data permissions, then drops to the unprivileged node user before migrations and the application start. If using a bind mount, dedicate that directory to FORGE: startup assigns its contents to UID 1000.

## Health check

The image checks `/api/health` on the internal port with Node's built-in fetch, so curl is not required. It allows a 90-second startup period for initialization. Keep the image health check; do not replace it with a different path in Coolify. A failed migration prevents the application from starting: inspect Runtime Logs for the actual error rather than extending the health-check delay.

## Existing SQLite database

For a new installation the migration runs automatically. If you already have production data created using `prisma db push`, back it up first, verify its schema matches prisma/schema.prisma, and baseline the included initial migration using a one-off container with the same DATABASE_URL and volume:

```bash
# Replace IMAGE with the actual built image, and VOLUME with the actual
# Docker volume name shown in Coolify. Do not use a new empty volume.
docker run --rm --entrypoint node \
  -e DATABASE_URL=file:/data/forge.db \
  -v VOLUME:/data IMAGE \
  node_modules/prisma/build/index.js migrate resolve \
  --applied 20261026000000_initial
```

Only baseline after verifying that the existing database already has the complete initial schema. Do not run `db push --accept-data-loss` during deployment. Future schema changes should be committed as Prisma migrations. Avoid overlapping deployments while SQLite migrations are running.

## Payments and AI

Configure Stripe keys in test mode first. Stripe webhooks must target:

```
https://your-store.example.com/api/webhooks/stripe
```

Enable the Checkout events listed in README.md. Without Stripe credentials checkout reports that payments are unavailable. Without OPENAI_API_KEY the catalog search fallback works. Schedule the order reconciliation command in the application container when using payments:

```bash
node server/reconcile.js
```

Do not use the old `npm start` command in this container: that local script requires a .env file. The Docker CMD directly starts Node and uses injected environment variables.

## Local Docker check

```bash
docker build -t forge-nutrition .
docker run --rm --name forge -p 3000:3000 \
  -v forge-data:/data \
  -e APP_URL=http://localhost:3000 \
  -e SEED_ON_START=true \
  -e ADMIN_EMAIL=you@example.com \
  -e ADMIN_PASSWORD='use-your-own-unique-password' \
  forge-nutrition
```

Visit http://localhost:3000 and http://localhost:3000/api/health. For production use HTTPS and the corresponding APP_URL.

## Verification of this package

The frontend build, API/search tests and applying the initial migration twice against an isolated SQLite database were checked. Docker is unavailable in the authoring environment, so an actual image build and Coolify deployment were not executed.
