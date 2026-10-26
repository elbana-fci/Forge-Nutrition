#!/bin/sh
set -eu

# A newly mounted Docker volume can be root-owned. Only initialization runs as
# root; migrations, seeding and the application run as the node user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R node:node /data
  exec gosu node /usr/local/bin/forge-entrypoint "$@"
fi

: "${DATABASE_URL:?Set DATABASE_URL}"
: "${APP_URL:?Set APP_URL to the exact public HTTPS origin}"

# Ensure the SQLite file exists before invoking the schema engine.
case "$DATABASE_URL" in
  file:/data/*) touch "${DATABASE_URL#file:}" ;;
  *) echo "DATABASE_URL must be an absolute SQLite file URL under /data" >&2; exit 1 ;;
esac
./node_modules/.bin/prisma migrate deploy
if [ "${SEED_ON_START:-false}" = "true" ]; then
  node prisma/seed.js
fi
exec "$@"
