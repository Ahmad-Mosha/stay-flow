#!/bin/sh
# Dumps the database into backups/ and keeps the last 7 days. Cron runs it daily (see README.md).
set -eu
cd "$(dirname "$0")"
# The dumps hold guests' details and password hashes: readable by this user only.
umask 077
mkdir -p backups

file="backups/stayflow-$(date -u +%Y-%m-%dT%H%MZ).dump"
trap 'rm -f "$file.partial"' EXIT
# The custom format is compressed, and pg_restore can restore a single table from it.
docker compose exec -T postgres pg_dump -U stayflow -d stayflow --format=custom > "$file.partial"
mv "$file.partial" "$file"

find backups -name 'stayflow-*.dump' -mtime +7 -delete
