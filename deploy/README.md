# Deploying Stay Flow

Stay Flow runs on one small Linux server (1 vCPU, 1 GB RAM) with Docker Compose. GitHub Actions
builds the images, so the server only pulls and runs them.

Caddy is the only container with public ports. It sends `/v1/*` to the API and everything else to
the web app; the API and the worker share Postgres. Prometheus, Alertmanager and Grafana watch it
all (see [Monitoring](#monitoring)).

| Service    | Image                               | Memory cap | Job                                            |
| ---------- | ----------------------------------- | ---------- | ---------------------------------------------- |
| `caddy`    | `caddy`                             | 64 MB      | HTTPS (Let's Encrypt), routing                 |
| `web`      | `ghcr.io/ahmad-mosha/stay-flow-web` | 224 MB     | Next.js server                                 |
| `api`      | `ghcr.io/ahmad-mosha/stay-flow-api` | 192 MB     | REST API                                       |
| `worker`   | same image as `api`                 | 160 MB     | Outbox emails, hold expiry, night audit        |
| `migrate`  | same image as `api`                 | none       | Applies migrations on each deploy, then exits  |
| `postgres` | `postgres:18`                       | 256 MB     | Database                                       |
| `mailpit`  | `axllent/mailpit`                   | 64 MB      | Catches emails until a real SMTP server is set |

| Monitoring          | Image                                   | Memory cap | Job                                               |
| ------------------- | --------------------------------------- | ---------- | ------------------------------------------------- |
| `prometheus`        | `prom/prometheus`                       | 192 MB     | Scrapes every part, keeps 15 days, runs the rules |
| `alertmanager`      | `prom/alertmanager`                     | 48 MB      | Groups alerts and sends them to Telegram          |
| `grafana`           | `grafana/grafana`                       | 192 MB     | Dashboards at `grafana.<domain>`, with a login    |
| `node-exporter`     | `prom/node-exporter`                    | 32 MB      | The server's CPU, memory, swap and disk           |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter` | 32 MB      | Postgres statistics, through a read-only role     |

Under load, the whole stack uses about 350 MB, and about 250 MB at rest on the live server. The caps
stop one leaking process from taking the server down, and 2 GB of swap absorbs short peaks.

## How a deploy works

1. A pull request builds both images, without pushing them.
2. After CI passes on `main`, the [Deploy workflow](../.github/workflows/deploy.yml) pushes the
   images to GHCR, tagged with the commit's sha and `latest`.
3. It copies this folder's stack files, `monitoring/` included, to `/opt/stay-flow` on the server
   over SSH and runs `deploy.sh <sha>`, which pulls the images, runs the migrations, swaps the
   containers whose image changed, waits for them to be healthy, and reloads Caddy, Prometheus and
   Alertmanager.

While a container restarts, Caddy holds new requests for up to 15 seconds instead of answering 502.

## Set up a server once

On a fresh Ubuntu 24.04 or newer server (the live one runs 26.04), as root. Paste one command at a
time: a password prompt swallows the lines pasted after it.

```sh
# A user for deploys, with your SSH key, and 2 GB of swap.
adduser deploy && usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/
# If root logged in with a password, that file is empty. Fetch your keys from GitHub instead:
#   su - deploy -c 'ssh-import-id-gh <github-user>'
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf && sysctl --system

# Keys only, and no root login. Test `ssh deploy@<server>` in a new terminal before logging out.
printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' \
  > /etc/ssh/sshd_config.d/00-hardening.conf
sshd -t && systemctl reload ssh

# Docker from Docker's own repository.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker deploy
install -d -o deploy -g deploy /opt/stay-flow
```

Then:

- **Firewall**: allow only TCP 22, 80 and 443, and UDP 443, in the cloud provider's firewall.
  Docker writes its own iptables rules, so a port Docker publishes skips `ufw`.
- **Domain**: point an A record (and AAAA for IPv6) at the server. Caddy needs it before the first
  deploy to get a certificate.
- **Settings**: as `deploy`, copy [.env.example](.env.example) to `/opt/stay-flow/.env`, fill it in
  and `chmod 600` it. The Telegram settings are explained under [Monitoring](#monitoring).
- **Grafana's domain**: `grafana.<domain>` must point at the server too. DuckDNS answers for every
  name under your domain, so there is nothing to add there.
- **Deploy key**: make a key pair for GitHub Actions only, on your own machine:
  `ssh-keygen -t ed25519 -N "" -C github-actions-deploy -f ~/.ssh/stayflow_deploy`. Add the public
  key to `/home/deploy/.ssh/authorized_keys` with the `restrict` option in front, which turns off
  port forwarding and terminals for it:
  `echo "restrict $(cat ~/.ssh/stayflow_deploy.pub)" | ssh deploy@<server> 'cat >> .ssh/authorized_keys'`.
  Copy the private key with `pbcopy < ~/.ssh/stayflow_deploy` (or `gh secret set`), not from the
  terminal screen: wrapped lines break it, and the workflow fails with `error in libcrypto`.

## Connect GitHub

In the repository's **Settings → Secrets and variables → Actions**:

| Name                 | Kind     | Value                                                |
| -------------------- | -------- | ---------------------------------------------------- |
| `DEPLOY_SSH_KEY`     | secret   | The deploy key's private half                        |
| `DEPLOY_HOST`        | variable | The domain, such as `stayfloww.duckdns.org`          |
| `DEPLOY_KNOWN_HOSTS` | variable | The output of `ssh-keyscan -t ed25519 <DEPLOY_HOST>` |
| `DEPLOY_USER`        | variable | Optional; `deploy` by default                        |

The deploy job is skipped until `DEPLOY_HOST` is set. The first image push creates two packages on
GHCR. If they are private, make both public (**Package settings → Change visibility**), so the
server can pull them without a token. Then run **Actions → Deploy → Run workflow**.

For the demo hotels and their host accounts (running it again adds only what is missing):

```sh
cd /opt/stay-flow
docker compose run --rm -e SEED_DEMO_DATA=true migrate node dist/seed/seed.js
```

## Run it

All commands run in `/opt/stay-flow` as `deploy`.

| Task              | Command                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Status and memory | `docker compose ps` and `docker stats --no-stream`                                                             |
| Logs              | `docker compose logs -f --tail 100 api`                                                                        |
| Roll back         | `./deploy.sh <older sha>`; migrations only go forward, so the old code must work with the new schema           |
| Database shell    | `docker compose exec postgres psql -U stayflow`                                                                |
| Read the emails   | `ssh -L 8025:localhost:8025 deploy@<server>`, then open http://localhost:8025                                  |
| Back up now       | `./backup.sh` (writes `backups/stayflow-<time>.dump`, keeps 7 days)                                            |
| Back up daily     | `crontab -e`, add `15 3 * * * /opt/stay-flow/backup.sh >> /opt/stay-flow/backup.log 2>&1`                      |
| Restore a backup  | `docker compose exec -T postgres pg_restore -U stayflow -d stayflow --clean --if-exists < backups/<file>.dump` |

Backups on the same disk protect against mistakes, not against losing the server: copy them
elsewhere now and then, for example with `scp` to your own machine.

## Monitoring

Prometheus scrapes the API (port 9464), the worker (9465), Caddy (2020), node-exporter and
postgres-exporter every 15 seconds on the private network, and evaluates the rules in
[monitoring/prometheus/rules](monitoring/prometheus/rules). Firing alerts go to Alertmanager, which
groups them and posts them to Telegram. Grafana loads its data sources and four dashboards
(Bookings, API health, Worker and email, Server and database) from
[monitoring/grafana](monitoring/grafana) when it starts.

| Page         | How to open it                                                                         |
| ------------ | -------------------------------------------------------------------------------------- |
| Grafana      | https://grafana.<domain>, user `admin`, password `GRAFANA_ADMIN_PASSWORD` from `.env`  |
| Prometheus   | `ssh -L 9090:localhost:9090 deploy@<server>`, then http://localhost:9090               |
| Alertmanager | `ssh -L 9093:localhost:9093 deploy@<server>`, then http://localhost:9093, for silences |

**Telegram, once.** In Telegram, ask **@BotFather** for `/newbot` and keep the token it sends. Send
your new bot any message, then open `https://api.telegram.org/bot<token>/getUpdates` in your
browser and find your chat id in `"chat":{"id":…`. Add both to `.env` with `nano .env`, as
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, before the first deploy that includes monitoring:
Compose refuses to start without them. Alertmanager reads them only when it starts, so after
changing them run `docker compose up -d --force-recreate alertmanager`.

**Test an alert.** `docker compose stop worker`; within about 3 minutes Telegram shows
**ServiceDown**. `docker compose start worker` sends the resolved message.

**Change a dashboard.** Grafana cannot save edits to these dashboards. Edit one in the UI, use
**Export → Export as JSON**, replace the file in `monitoring/grafana/dashboards/` and commit it.

**Change a rule.** Edit `monitoring/prometheus/rules/`, add a case to
`monitoring/prometheus/tests/alerts.test.yml`, and run the tests, as CI does:

```sh
docker compose run --rm --no-deps --workdir /etc/prometheus --entrypoint promtool prometheus test rules tests/alerts.test.yml
```

Each deploy copies `monitoring/` over the old one, so a file deleted from the repository stays on
the server until you delete it there. The Grafana admin password in `.env` only counts the first
time Grafana starts; change it later with
`docker compose exec grafana grafana cli admin reset-admin-password <new>`.
