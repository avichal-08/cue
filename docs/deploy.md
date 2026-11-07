# Deploy

Cue runs on any Linux VM with Docker. Postgres stays on Neon, and everything else runs on the box from one compose file. Caddy is the only thing exposed, and it serves the whole app from one origin:

| path     | goes to          |
| -------- | ---------------- |
| `/api/*` | api (prefix cut) |
| `/cue/*` | minio (bucket)   |
| `/*`     | web              |

Because the bucket is served through the same origin, presigned upload and playback URLs work in the browser without CORS. The api signs them against `PUBLIC_URL`, while the worker keeps reading MinIO over the internal network.

## 1. Get a VM

The steps below assume Ubuntu 24.04 or Debian 12. Any provider works, as long as the VM has:

- **CPU and memory:** at least 2 vCPU and 2 GB. One `next build` plus ffmpeg doesn't fit in 1 GB.
- **Disk:** 30 GB. Uploaded videos and frames live on this disk.
- **Public IP:** a static one, so the address survives a restart.
- **Inbound rules:**
  - port 22 from your IP only;
  - ports 80 and 443 from anywhere.

  Set these in the provider's network firewall. The VM itself needs no firewall changes.

## 2. Prepare it

```bash
ssh <user>@<public-ip>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit
```

SSH back in, then add swap so the web build has headroom:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Configure

```bash
git clone https://github.com/avichal-08/cue.git && cd cue
cp .env.example .env && nano .env
```

Set these in `.env`:

- `DATABASE_URL`: the Neon URL. Migrations run from your machine, not the VM, so apply them before deploying with `pnpm db:migrate`.
- `GROQ_API_KEY` and `GEMINI_API_KEY`.
- `S3_ACCESS_KEY` and `S3_SECRET_KEY`: new values for this box. The secret key must be at least 8 characters.
- `PUBLIC_URL`: the address people will open.
  - Without a domain, use `http://<public-ip>`.
  - With a domain, use `https://cue.example.com`. Point an A record at the public IP first, and Caddy fetches the certificate itself.

`REDIS_URL`, `S3_ENDPOINT`, `WEB_ORIGIN` and `API_PORT` are overridden by the compose file, so their values in `.env` don't matter here.

## 4. Run

```bash
docker compose -f infra/compose.prod.yml --env-file .env up -d --build
curl <PUBLIC_URL>/api/health
```

The first build takes a few minutes. `/api/health` should answer `{"ok":true,"db":"ok","redis":"ok"}`. Then upload a short video and check that it reaches `ready`.

Watch the logs with:

```bash
docker compose -f infra/compose.prod.yml logs -f api worker
```

## Update

```bash
git pull && docker compose -f infra/compose.prod.yml --env-file .env up -d --build
```

If a commit adds a migration, run `pnpm db:migrate` against Neon from your machine before you deploy it.

## Notes

- **Docker images:** the worker image installs the distro's ffmpeg. The npm static builds crash when they resolve a container hostname such as `minio`.
- **Redis:** runs with `noeviction` and append-only persistence, so queued jobs survive a restart.
- **Data:** videos, frames and queue state live in Docker volumes. `docker compose ... down` keeps them, and `down -v` deletes them.
- **Links:** YouTube often blocks downloads from cloud IPs, so on a VM, uploading a file is more reliable than ingesting a link.
