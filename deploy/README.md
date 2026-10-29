# Deploying Stay Flow

Stay Flow runs on one small Linux server (1 vCPU, 1 GB RAM) with Docker Compose. GitHub Actions
builds the images, so the server only pulls and runs them.

```
                 ┌──────────────────────────── server ─────────────────────────────┐
 browser ─HTTPS─▶│ Caddy ─┬─ /v1/* ─▶ api ──┐                                      │
                 │        └─ rest ──▶ web ──┴─▶ postgres ◀── worker ──▶ mailpit    │
                 └─────────────────────────────────────────────────────────────────┘
```

| Service    | Image                               | Memory cap | Job                                            |
| ---------- | ----------------------------------- | ---------- | ---------------------------------------------- |
| `caddy`    | `caddy`                             | 64 MB      | HTTPS (Let's Encrypt), routing                 |
| `web`      | `ghcr.io/ahmad-mosha/stay-flow-web` | 224 MB     | Next.js server                                 |
| `api`      | `ghcr.io/ahmad-mosha/stay-flow-api` | 192 MB     | REST API                                       |
| `worker`   | same image as `api`                 | 160 MB     | Outbox emails, hold expiry, night audit        |
| `migrate`  | same image as `api`                 | none       | Applies migrations on each deploy, then exits  |
| `postgres` | `postgres:18`                       | 256 MB     | Database                                       |
| `mailpit`  | `axllent/mailpit`                   | 64 MB      | Catches emails until a real SMTP server is set |

Under load, the whole stack uses about 350 MB. The caps stop one leaking process from taking the
server down, and 2 GB of swap absorbs short peaks.

## How a deploy works

1. A pull request builds both images, without pushing them.
2. After CI passes on `main`, the [Deploy workflow](../.github/workflows/deploy.yml) pushes the
   images to GHCR, tagged with the commit's sha and `latest`.
3. It copies this folder's stack files to `/opt/stay-flow` on the server over SSH and runs
   `deploy.sh <sha>`, which pulls the images, runs the migrations, swaps the containers whose image
   changed and waits for them to be healthy.

While a container restarts, Caddy holds new requests for up to 15 seconds instead of answering 502.

## Set up a server once

On a fresh Ubuntu 24.04 server, as root:

```sh
# A user for deploys, with your SSH key, and 2 GB of swap.
adduser deploy && usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/
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
  and `chmod 600` it.
- **Deploy key**: make a key pair for GitHub Actions only. Add the public key to
  `/home/deploy/.ssh/authorized_keys` with the `restrict` option in front, which turns off port
  forwarding and terminals for it.

## Connect GitHub

In the repository's **Settings → Secrets and variables → Actions**:

| Name                 | Kind     | Value                                                |
| -------------------- | -------- | ---------------------------------------------------- |
| `DEPLOY_SSH_KEY`     | secret   | The deploy key's private half                        |
| `DEPLOY_HOST`        | variable | The domain, such as `stayflow.duckdns.org`           |
| `DEPLOY_KNOWN_HOSTS` | variable | The output of `ssh-keyscan -t ed25519 <DEPLOY_HOST>` |
| `DEPLOY_USER`        | variable | Optional; `deploy` by default                        |

The deploy job is skipped until `DEPLOY_HOST` is set. The first image push creates two private
packages on GHCR; make both public (**Package settings → Change visibility**), so the server can pull
them without a token. Then run **Actions → Deploy → Run workflow**.

For the demo hotel and its host accounts, once:

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
