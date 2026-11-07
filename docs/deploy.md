# Deploy

One VM runs everything except Postgres, which stays on Neon. Caddy is the only thing exposed, and it serves the whole app from one origin:

| path     | goes to          |
| -------- | ---------------- |
| `/api/*` | api (prefix cut) |
| `/cue/*` | minio (bucket)   |
| `/*`     | web              |

Because the bucket is served through the same origin, presigned upload and playback URLs work in the browser without CORS. The api signs them against `PUBLIC_URL`, while the worker keeps reading MinIO over the internal network.

## 1. Launch the VM

- **AMI:** Ubuntu 24.04 LTS.
- **Instance type:** `t3.small` (2 vCPU, 2 GB). One `next build` plus ffmpeg doesn't fit in 1 GB.
- **Storage:** 30 GB gp3. Uploaded videos and frames live on this disk.
- **Security group:**
  - port 22 from your IP;
  - ports 80 and 443 from anywhere.
- **Elastic IP:** allocate one and attach it, so the address survives a reboot.

## 2. Prepare it

```bash
ssh -i cue.pem ubuntu@<elastic-ip>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit
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

- `DATABASE_URL`: the Neon URL. Its migrations are already applied.
- `GROQ_API_KEY` and `GEMINI_API_KEY`.
- `S3_ACCESS_KEY` and `S3_SECRET_KEY`: new values for this box. The secret key must be at least 8 characters.
- `PUBLIC_URL`: the address people will open.
  - Without a domain, use `http://<elastic-ip>`.
  - With a domain, use `https://cue.example.com`. Point an A record at the elastic IP first, and Caddy fetches the certificate itself.

`REDIS_URL`, `S3_ENDPOINT`, `WEB_ORIGIN` and `API_PORT` are overridden by the compose file, so their values in `.env` don't matter here.

## 4. Run

```bash
docker compose -f infra/compose.prod.yml --env-file .env up -d --build
curl <PUBLIC_URL>/api/health
```

The first build takes a few minutes. Watch the logs with:

```bash
docker compose -f infra/compose.prod.yml logs -f api worker
```

## Update

```bash
git pull && docker compose -f infra/compose.prod.yml --env-file .env up -d --build
```

If a commit adds a migration, run `pnpm db:migrate` against Neon from your machine before you deploy it.

## Notes

- YouTube often blocks downloads from cloud IPs, so on the VM, uploading a file is more reliable than ingesting a link.
- Redis runs with `noeviction` and append-only persistence, so queued jobs survive a restart.
