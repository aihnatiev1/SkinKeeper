# SkinKeeper Server Deployment Task

> Task for Claude on the production server. Copy-paste this entire file.

---

## Context

SkinKeeper — CS2 skin tracking & trading app (Flutter mobile + Express.js backend + PostgreSQL).
Going to App Store & Google Play — everything must be production-grade, secure, and store-compliant.

## What needs to be deployed

- **Express.js 5 backend** (TypeScript, compiled to JS)
- **PostgreSQL 17** database
- **Nginx** reverse proxy with SSL
- **PM2** process manager
- **Firewall** (UFW)

## Step-by-step

### 1. System preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essentials
sudo apt install -y curl git build-essential nginx certbot python3-certbot-nginx ufw
```

### 2. Node.js 22 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pm2
```

### 3. PostgreSQL 17

```bash
sudo apt install -y postgresql-17 postgresql-contrib-17

# Create database and user
sudo -u postgres psql <<EOF
CREATE USER skinkeeper WITH PASSWORD '<GENERATE_STRONG_PASSWORD>';
CREATE DATABASE skinkeeper OWNER skinkeeper;
GRANT ALL PRIVILEGES ON DATABASE skinkeeper TO skinkeeper;
\c skinkeeper
GRANT ALL ON SCHEMA public TO skinkeeper;
EOF
```

PostgreSQL config tuning (`/etc/postgresql/17/main/postgresql.conf`):
```
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 4MB
maintenance_work_mem = 128MB
```

`pg_hba.conf` — ensure local connections use `md5`:
```
local   skinkeeper   skinkeeper   md5
```

```bash
sudo systemctl restart postgresql
```

### 4. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Do NOT expose port 3000 — nginx proxies to it
sudo ufw enable
```

### 5. App user (non-root)

```bash
sudo useradd -m -s /bin/bash skinkeeper
sudo mkdir -p /opt/skinkeeper
sudo chown skinkeeper:skinkeeper /opt/skinkeeper
```

### 6. Deploy backend code

Clone or copy the `backend/` directory to `/opt/skinkeeper/backend/`.

```bash
cd /opt/skinkeeper/backend
npm ci --production=false   # need devDependencies for tsc
npm run build               # compiles TypeScript → dist/
npm prune --production      # remove devDependencies after build
```

### 7. Environment file

Create `/opt/skinkeeper/backend/.env`:

```env
NODE_ENV=production
PORT=3000

# Database — use the password from step 3
DATABASE_URL=postgresql://skinkeeper:<DB_PASSWORD>@localhost:5432/skinkeeper

# IMPORTANT: Generate new secrets for production!
# Run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<GENERATE_64_BYTE_HEX>

# Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<GENERATE_32_BYTE_HEX>

# Steam API key — get from https://steamcommunity.com/dev/apikey
STEAM_API_KEY=<YOUR_STEAM_API_KEY>

# CSFloat API key
CSFLOAT_API_KEY=<YOUR_CSFLOAT_API_KEY>

# Firebase service account JSON (for push notifications)
# Either path to file or inline JSON:
# FIREBASE_SERVICE_ACCOUNT=/opt/skinkeeper/firebase-service-account.json
# Or set GOOGLE_APPLICATION_CREDENTIALS=/opt/skinkeeper/firebase-service-account.json
```

**Permissions:**
```bash
chmod 600 /opt/skinkeeper/backend/.env
chown skinkeeper:skinkeeper /opt/skinkeeper/backend/.env
```

### 8. Run migrations

```bash
sudo -u skinkeeper bash -c 'cd /opt/skinkeeper/backend && node dist/db/migrate.js'
```

### 9. PM2 process manager

Create `/opt/skinkeeper/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [{
    name: 'skinkeeper-api',
    script: './dist/index.js',
    cwd: '/opt/skinkeeper/backend',
    instances: 1,          // single instance (price crawlers are stateful)
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/opt/skinkeeper/logs/error.log',
    out_file: '/opt/skinkeeper/logs/out.log',
    merge_logs: true,
    // Auto-restart on crash
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    // Watch is OFF in production
    watch: false,
  }]
};
```

```bash
sudo mkdir -p /opt/skinkeeper/logs
sudo chown skinkeeper:skinkeeper /opt/skinkeeper/logs

# Start
sudo -u skinkeeper bash -c 'cd /opt/skinkeeper && pm2 start ecosystem.config.cjs'

# Save PM2 config and setup startup script
sudo -u skinkeeper bash -c 'pm2 save'
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u skinkeeper --hp /home/skinkeeper
```

### 10. Nginx reverse proxy

Create `/etc/nginx/sites-available/skinkeeper`:

```nginx
server {
    listen 80;
    server_name api.skinkeeper.app;  # <-- REPLACE WITH YOUR DOMAIN

    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.skinkeeper.app;  # <-- REPLACE WITH YOUR DOMAIN

    # SSL certificates (certbot will fill these)
    ssl_certificate /etc/letsencrypt/live/api.skinkeeper.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.skinkeeper.app/privkey.pem;

    # SSL hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Request size limit (for receipts, etc.)
    client_max_body_size 5M;

    # Rate limiting zone (defined in nginx.conf http block)
    # limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check (no rate limit)
    location /api/health {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Add rate limiting to `/etc/nginx/nginx.conf` inside `http {}` block:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
```

```bash
sudo ln -s /etc/nginx/sites-available/skinkeeper /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
```

### 11. SSL certificate

```bash
# First, get cert without HTTPS redirect (comment out the 443 block, keep only port 80 with certbot)
# Or just run:
sudo certbot --nginx -d api.skinkeeper.app  # <-- YOUR DOMAIN
sudo systemctl reload nginx
```

### 12. Verify

```bash
# Local check
curl http://localhost:3000/api/health

# External check
curl https://api.skinkeeper.app/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### 13. Backups (cron)

Create `/opt/skinkeeper/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/skinkeeper/backups"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Dump database
PGPASSWORD="<DB_PASSWORD>" pg_dump -U skinkeeper -h localhost skinkeeper | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"

# Keep last 14 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +14 -delete

echo "Backup complete: db_$TIMESTAMP.sql.gz"
```

```bash
chmod +x /opt/skinkeeper/backup.sh
# Add to crontab (daily at 3:00 AM)
echo "0 3 * * * /opt/skinkeeper/backup.sh >> /opt/skinkeeper/logs/backup.log 2>&1" | sudo -u skinkeeper crontab -
```

### 14. Log rotation

Create `/etc/logrotate.d/skinkeeper`:

```
/opt/skinkeeper/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
}
```

---

## Store compliance notes

These are things Apple/Google reviewers check:

1. **HTTPS only** — all API traffic over TLS (nginx handles this)
2. **Privacy Policy & Terms** — the `/legal` routes serve these pages, make sure they're accessible at:
   - `https://api.skinkeeper.app/legal/privacy`
   - `https://api.skinkeeper.app/legal/terms`
3. **No hardcoded dev tokens** — the Flutter app must NOT ship with devToken in production builds
4. **Data deletion** — Apple requires account deletion capability. Ensure DELETE `/api/auth/account` endpoint works
5. **Receipt validation** — IAP receipts must be validated server-side (already in `/api/purchases`)

## Security checklist

- [ ] JWT_SECRET is unique, 64+ bytes, NOT "dev-secret-change-in-production"
- [ ] ENCRYPTION_KEY is unique, 32 bytes hex
- [ ] .env file is chmod 600
- [ ] PostgreSQL only accepts local connections (no external access)
- [ ] Port 3000 is NOT exposed in firewall (only 80/443)
- [ ] No dev tokens in production Flutter build
- [ ] CORS configured to allow only your app (currently allows all — tighten in production)
- [ ] Helmet.js enabled (already in code)
- [ ] SSL/TLS with A+ rating

## Update process

When deploying new backend code:

```bash
cd /opt/skinkeeper/backend
git pull                    # or scp new files
npm ci --production=false
npm run build
npm prune --production
pm2 restart skinkeeper-api
```

## Monitoring commands

```bash
pm2 status                  # process status
pm2 logs skinkeeper-api    # live logs
pm2 monit                   # CPU/RAM monitor
sudo systemctl status nginx
sudo systemctl status postgresql
```
