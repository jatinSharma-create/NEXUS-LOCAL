# Nexus v0

Nexus is a candidate screening platform. This guide walks you through running the full local stack with Docker — from first-time setup to shutting everything down.

## Prerequisites

Before you begin, make sure you have the following installed:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- A terminal (Terminal on macOS, or any shell of your choice)

Verify Docker is running:

```bash
docker --version
docker compose version
```

Both commands should print a version number. If Docker Desktop is not open, start it first and wait until it shows as running.

---

## Project structure

```
NEXUS/
├── app/                  # Next.js application
├── db/init.sql           # PostgreSQL schema (auto-applied on first start)
├── Caddyfile             # Reverse proxy config
├── docker-compose.yml    # All services defined here
├── .env.example          # Environment variable template
└── .env                  # Your local config (you create this)
```

### Services

| Service   | Image / Build        | Purpose                        | Exposed ports      |
|-----------|----------------------|--------------------------------|--------------------|
| `app`     | Built from `./app`   | Next.js web application        | Internal only      |
| `db`      | postgres:16-alpine   | PostgreSQL database            | Internal only      |
| `storage` | minio/minio          | S3-compatible file storage     | 9000, 9001         |
| `redis`   | redis:7-alpine       | Cache / job queue              | Internal only      |
| `caddy`   | caddy:2-alpine       | Reverse proxy + TLS            | 80, 443            |

---

## Step 1 — Clone and enter the project

```bash
cd /path/to/NEXUS
```

---

## Step 2 — Create your environment file

Copy the example env file and edit it if needed:

```bash
cp .env.example .env
```

The default values work out of the box for local development:

```env
DOMAIN=localhost
APP_PASSWORD=supersecretpassword
TELNYX_API_KEY=
TELNYX_PUBLIC_KEY=
```

| Variable           | Description                                      |
|--------------------|--------------------------------------------------|
| `DOMAIN`           | Hostname Caddy listens on (`localhost` for dev)  |
| `APP_PASSWORD`     | Password used to log in to the web UI            |
| `TELNYX_API_KEY`   | Telnyx API key (not needed for Day 1)            |
| `TELNYX_PUBLIC_KEY`| Telnyx webhook public key (not needed for Day 1) |

> **Tip:** Change `APP_PASSWORD` to something secure before sharing or deploying.

---

## Step 3 — Start the stack

Build the app image and start all services in the background:

```bash
docker compose up -d --build
```

The first run takes a few minutes while Docker pulls images and builds the Next.js app. Subsequent starts are much faster.

You should see output ending with all containers started:

```
✔ Container nexus-app-1      Started
✔ Container nexus-db-1       Started
✔ Container nexus-redis-1    Started
✔ Container nexus-storage-1  Started
✔ Container nexus-caddy-1    Started
```

---

## Step 4 — Check that everything is running

### 4a. Container status

```bash
docker compose ps
```

All five services should show `Up` in the STATUS column:

```
NAME              STATUS    PORTS
nexus-app-1       Up        3000/tcp
nexus-caddy-1     Up        0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
nexus-db-1        Up        5432/tcp
nexus-redis-1     Up        6379/tcp
nexus-storage-1   Up        0.0.0.0:9000-9001->9000-9001/tcp
```

If `caddy` shows `Restarting`, check its logs (see [Troubleshooting](#troubleshooting) below).

### 4b. View logs

All services:

```bash
docker compose logs
```

A single service (e.g. the app):

```bash
docker compose logs app
```

Follow logs in real time:

```bash
docker compose logs -f app
```

Press `Ctrl+C` to stop following.

### 4c. Verify the database schema

```bash
docker exec nexus-db-1 psql -U nexus -d nexus -c "\dt"
```

Expected output:

```
           List of relations
 Schema |    Name    | Type  | Owner
--------+------------+-------+-------
 public | calls      | table | nexus
 public | candidates | table | nexus
```

### 4d. Verify auth is working (curl)

Unauthenticated request should redirect to login:

```bash
curl -skI https://localhost/ | grep -E "HTTP/|location:"
```

Expected:

```
HTTP/2 307
location: /login
```

Log in and access the dashboard:

```bash
# Save session cookie
curl -sk -c /tmp/nexus-cookies.txt \
  -X POST https://localhost/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"supersecretpassword"}'

# Access protected page with cookie
curl -sk -b /tmp/nexus-cookies.txt https://localhost/ | grep "Nexus Dashboard"
```

---

## Step 5 — Open the app in your browser

1. Go to **https://localhost**
   - Caddy automatically redirects `http://localhost` → `https://localhost`
   - Your browser may show a certificate warning for the self-signed local cert — this is expected. Proceed to the site.
2. You will be redirected to the login page.
3. Enter the password from your `.env` file (default: `supersecretpassword`).
4. After signing in you should see the **Nexus Dashboard**.

### Other local endpoints

| URL                        | Description              |
|----------------------------|--------------------------|
| https://localhost          | Main web application     |
| http://localhost:9001        | MinIO console (admin UI) |
| http://localhost:9000        | MinIO S3 API             |

MinIO credentials (from `docker-compose.yml`):

- Username: `admin`
- Password: `password123`

---

## Day-to-day commands

### Start (without rebuilding)

Use this when nothing has changed in the code:

```bash
docker compose up -d
```

### Rebuild after code changes

```bash
docker compose up -d --build
```

### Restart a single service

```bash
docker compose restart app
```

### Stop the stack (containers removed, data kept)

```bash
docker compose down
```

Your database, MinIO files, and Redis data are preserved in Docker volumes and will be there when you start again.

### Stop and wipe all data

> **Warning:** This deletes the database, uploaded files, and all persisted volumes. Use only when you want a completely fresh start.

```bash
docker compose down -v
```

After wiping, the database schema is re-applied automatically from `db/init.sql` on the next `docker compose up`.

---

## Shutting down — quick reference

| Goal                              | Command                    |
|-----------------------------------|----------------------------|
| Stop containers, keep data          | `docker compose down`      |
| Stop containers, delete all data    | `docker compose down -v`   |
| Stop without removing containers  | `docker compose stop`      |
| Start previously stopped stack    | `docker compose start`     |

---

## Troubleshooting

### Caddy keeps restarting

Check that your `.env` file exists and has `DOMAIN=localhost` set:

```bash
cat .env
docker compose logs caddy
```

Caddy needs the `DOMAIN` variable to render the `Caddyfile` correctly. If it is missing, restart after fixing `.env`:

```bash
docker compose down
docker compose up -d
```

### Port 80 or 443 already in use

Another process is using those ports. Find and stop it, or change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "8080:80"
  - "8443:443"
```

Then access the app at `https://localhost:8443`.

### App builds slowly

The first build downloads all npm dependencies. Subsequent builds are faster thanks to Docker layer caching and the `app/.dockerignore` file.

### Login works but I get redirected back to login

Make sure you are accessing the site over **HTTPS** (`https://localhost`), not HTTP. Caddy issues a session cookie that works correctly over the TLS connection it sets up for localhost.

### View app logs for errors

```bash
docker compose logs app --tail 50
```

### Reset everything and start fresh

```bash
docker compose down -v
cp .env.example .env   # optional: reset env too
docker compose up -d --build
```

---

## Development without Docker (optional)

If you want to run just the Next.js app locally for faster iteration:

```bash
cd app
npm install
APP_PASSWORD=supersecretpassword npm run dev
```

The app will be available at http://localhost:3000. Note that the database, Redis, and MinIO will not be available unless you also start those services via Docker:

```bash
# From the project root — start infra only
docker compose up -d db redis storage
```

---

## Environment variables reference

| Variable            | Used by  | Default (local)          |
|---------------------|----------|--------------------------|
| `DOMAIN`            | app, caddy | `localhost`            |
| `APP_PASSWORD`      | app      | `supersecretpassword`    |
| `DATABASE_URL`      | app      | Set in docker-compose    |
| `REDIS_URL`         | app      | Set in docker-compose    |
| `MINIO_ENDPOINT`    | app      | `storage`                |
| `MINIO_PORT`        | app      | `9000`                   |
| `TELNYX_API_KEY`    | app      | (empty — future use)     |
| `TELNYX_PUBLIC_KEY` | app      | (empty — future use)     |
