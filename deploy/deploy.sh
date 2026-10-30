#!/bin/sh
# Deploys the images of one commit: ./deploy.sh <commit sha>. The Deploy workflow runs it after CI
# passes on main; run it by hand with an older sha to roll back.
set -eu
cd "$(dirname "$0")"

tag="${1:?usage: ./deploy.sh <commit sha>}"
case "$tag" in
  *[!A-Za-z0-9._-]*) echo "Not an image tag: $tag" >&2; exit 1 ;;
esac

# Keep the tag in .env, so a later `docker compose up -d` runs the same version.
if grep -q '^IMAGE_TAG=' .env; then
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" .env
else
  echo "IMAGE_TAG=$tag" >> .env
fi

docker compose pull --quiet
# Runs the migrations first, then replaces only the containers whose image or settings changed,
# and fails if they do not become healthy.
docker compose up -d --remove-orphans --wait
# Caddy, Prometheus and Alertmanager do not watch their configs; a reload with no changes does
# nothing, and a broken config is refused while the old one keeps running.
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose kill -s HUP prometheus alertmanager
# The metrics exporter's read-only database role, with the password from .env. The password goes
# through the environment, not the command line, where `ps` would show it.
EXPORTER_PASSWORD=$(sed -n 's/^POSTGRES_EXPORTER_PASSWORD=//p' .env) \
  docker compose exec -T -e EXPORTER_PASSWORD postgres \
  psql -U stayflow -d stayflow -q -v ON_ERROR_STOP=1 < monitoring/postgres/exporter-role.sql
# Old releases would fill the disk; GHCR keeps every one for a rollback.
docker image prune -af --filter 'label=org.opencontainers.image.source=https://github.com/Ahmad-Mosha/stay-flow'
