# Nexus — Local Candidate Screening Platform

Hey! 👋 I built this project to solve a very specific problem I heard from a recruiter: **"Great ideas and candidate details often get lost right after the screening call."**

As a university student curious about the future, I wanted to stay ahead in this fast-moving era of AI. I decided to see how quickly and effectively I could build a full-stack solution to this exact problem. By leveraging AI tools like **Cursor**, I was able to write the code, debug complex integrations, and ship this project incredibly fast! 🚀

## 💡 The Problem & The Solution

**The Problem:** Recruiters talk to dozens of candidates. During or right after a call, brilliant insights, notes, and specific resume details get lost in the shuffle of tabs, notebooks, and disconnected software.

**The Solution (Nexus):** A streamlined, local-first web application where you can:
- 📄 **Upload Resumes:** Store and manage candidate PDFs/DOCXs using a local MinIO bucket.
- 🔍 **Search & Screen:** Instantly find who you're looking for and let Gemini AI extract key resume data automatically.
- 📞 **Smart AI Calling & Recording:** If you configure your secrets, you can actually **call the candidate directly from the web app**. The app asks for the candidate's consent to record. Once consent is given, the call is recorded, transcribed, and summarized. The summary is then stored permanently as a PDF that you can access at any point in time!
- 🔒 **Local & Private:** Everything runs entirely on your own computer. Your candidate data never leaves your machine unless you explicitly initiate a call.

Building this taught me a massive amount about combining Docker, Postgres, Redis, and Telnyx (for telephony), all while utilizing AI to accelerate my workflow. 

Below is the original, highly-detailed guide I wrote for absolute beginners to get this running on their own machines using Docker. 🎓✨

---

# Complete Beginner Setup Guide

This guide is for someone who has **never used GitHub, Docker, or coding tools** before.

By the end, you will have Nexus running on your computer and open in your browser.

**What Nexus is:** a local candidate screening web app (upload resumes, search candidates, add notes, make calls).

**Important:** Everything below runs on **your own computer**. Your data stays on your machine.

### Branches

| Branch | Use |
|--------|-----|
| **`develop`** | Day-to-day coding and local Docker testing |
| **`deploy`** | Stable release — **clone this on AWS Lightsail** (see DEPLOYMENT.md) |

Recruiters using the hosted product open a URL only (no Docker). **~$10/mo AWS Lightsail** — no domain purchase needed (free sslip.io hostname). See **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

---

## What you need before starting

- A computer (Mac or Windows)
- Internet connection
- About **30–60 minutes** the first time (downloads can be large)
- Roughly **10 GB free space** on your hard drive (more is better)
- A `.env` file shared with you privately by the team (this contains passwords/API keys)

You do **not** need to know how to code.

---

## For the person SHARING Nexus — what to hand over

If you already run Nexus and want someone else to have the **exact same working app**, give them these five things.

### 1. The repo link

```text
https://github.com/jatinSharma-create/NEXUS-LOCAL
```

If the repo is private, invite their GitHub username as a collaborator.

### 2. The `.env` file (most important)

Send your working `.env` **privately** (AirDrop, password manager, encrypted email — never a public chat). Without it, the app starts but resume upload and calling will not work.

The `.env` must contain values for:

| Setting | Needed for | Where you got it |
|---------|-----------|------------------|
| `APP_PASSWORD` | Logging into Nexus | You choose it |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Resume parsing, call summaries | https://aistudio.google.com/apikey |
| `GROQ_API_KEY` | Call transcription | https://console.groq.com/keys |
| `TELNYX_API_KEY` | Calling | Telnyx Mission Control |
| `TELNYX_PUBLIC_KEY` | Verifying call webhooks | Telnyx Mission Control |
| `TELNYX_CALL_CONTROL_APP_ID` | Calling | Telnyx Mission Control |
| `TELNYX_TELEPHONY_CREDENTIAL_ID` | Browser calling (WebRTC) | Telnyx Mission Control |
| `TELNYX_CALLER_ID` | The number calls come from | Telnyx phone number |
| `TELNYX_SIP_URI` | Connecting your browser to the call | Telnyx SIP credential |
| `MINIO_*`, `DATABASE_URL`, `REDIS_URL` | Internal storage/database | Leave at defaults |

**Sharing API keys means they use your quota/billing.** If you would rather not share, tell them to create their own free Gemini and Groq keys and paste those in instead — everything except calling works with just a Gemini key.

### 3. The login password

Tell them the `APP_PASSWORD` value from the `.env` you sent.

### 4. This README

They should follow it top to bottom. Point them at **Part A**.

### 5. What is NOT shared

- **Your candidate data does not travel with the app.** They start with an empty database.
- Resumes, notes, and call recordings stay on whoever's computer created them.

> Want them to skip Docker entirely? Deploy Nexus to a server instead and just send them a URL + password — see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

---

## Big picture (what you will do)

1. Install **Docker Desktop** (runs the app in containers).
2. Install **Git** (downloads the project from GitHub).
3. Create a free **GitHub** account (if you don’t have one).
4. **Download (clone)** the Nexus project.
5. Put the shared **`.env`** file into the project folder.
6. Start Nexus with one command.
7. Open it in your browser and log in.

---

## Part A — Install Docker Desktop

Docker is the tool that runs Nexus for you. Think of it like an “app engine” that starts all the pieces automatically.

### A1. Download Docker Desktop

1. Open your web browser.
2. Go to: https://www.docker.com/products/docker-desktop/
3. Click **Download** for your computer:
   - **Mac** → choose Apple Silicon (M1/M2/M3/M4) or Intel, whichever matches your Mac
   - **Windows** → download Docker Desktop for Windows
4. Wait for the installer to finish downloading.

### A2. Install Docker Desktop

**On Mac**

1. Open the downloaded `.dmg` file.
2. Drag **Docker** into the **Applications** folder.
3. Open **Applications** → double-click **Docker**.
4. If Mac asks “Are you sure you want to open this?”, click **Open**.
5. Follow any on-screen prompts (Accept / OK / Next).
6. Wait until the Docker whale icon in the top menu bar says Docker is **running**.

**On Windows**

1. Open the downloaded installer.
2. Click through **Next / OK / Install** (accept defaults unless you know otherwise).
3. If it asks to restart your computer, restart.
4. After restart, open **Docker Desktop** from the Start menu.
5. Wait until it says Docker is **running**.

### A3. Confirm Docker works

1. Open a terminal:
   - **Mac:** press `Command + Space`, type `Terminal`, press Enter
   - **Windows:** press the Windows key, type `PowerShell` or `Command Prompt`, press Enter
2. Copy and paste this, then press Enter:

```bash
docker --version
```

3. You should see something like `Docker version 2x.x.x ...`
4. Then run:

```bash
docker compose version
```

5. You should see a version number.

If either command says “not found” or “not recognized”, Docker is not installed/running yet. Open Docker Desktop and wait until it fully starts, then try again.

---

## Part B — Install Git (to download the project)

Git is the tool that downloads code from GitHub.

### B1. Check if Git is already installed

In Terminal / PowerShell, run:

```bash
git --version
```

- If you see a version number (example: `git version 2.39.0`), skip to **Part C**.
- If it says command not found, continue.

### B2. Install Git

**On Mac**

1. In Terminal, run:

```bash
xcode-select --install
```

2. A popup may appear → click **Install**.
3. Wait until it finishes.
4. Run `git --version` again to confirm.

**On Windows**

1. Go to: https://git-scm.com/download/win
2. Download and run the installer.
3. Click **Next** through the screens (defaults are fine).
4. Finish install.
5. **Close and reopen** PowerShell/Command Prompt.
6. Run `git --version` again.

---

## Part C — GitHub account (do you need one?)

### Can anyone clone this repo?

**Yes**, if the repository is **public**.

This project’s GitHub page is:

https://github.com/jatinSharma-create/NEXUS-LOCAL

- If that page opens and you can see files **without logging in**, the repo is public → anyone can download it.
- If GitHub asks you to log in / says “404” / “private”, ask the owner to either:
  - make the repo public, or
  - add your GitHub username as a collaborator (invite).

### Do you need SSH keys?

**No — not for this beginner guide.**

We will use **HTTPS clone**, which is simpler. You usually do **not** need to set up SSH.

You only need a GitHub account if:

- the repo is private and you were invited, or
- GitHub asks you to sign in when cloning

### C1. Create a GitHub account (only if needed)

1. Go to: https://github.com/signup
2. Create an account with your email.
3. Verify your email if GitHub asks.
4. Sign in at https://github.com/login

---

## Part D — Download (clone) the Nexus project

“Clone” means: copy the whole project from GitHub onto your computer.

### D1. Choose where to put it

Example:

- Mac: your Desktop
- Windows: your Desktop

In Terminal / PowerShell:

**Mac**

```bash
cd ~/Desktop
```

**Windows**

```bash
cd %USERPROFILE%\Desktop
```

(In PowerShell you can also use: `cd ~\Desktop`)

### D2. Clone with HTTPS (recommended for beginners)

Copy and paste this exact command, then press Enter:

```bash
git clone https://github.com/jatinSharma-create/NEXUS-LOCAL.git
```

What should happen:

- It creates a folder named `NEXUS-LOCAL` on your Desktop
- It downloads all project files into that folder

If it asks you to sign in to GitHub:

1. Sign in with your GitHub username/password (or browser login prompt)
2. On newer GitHub setups, password login for git may require a **Personal Access Token** instead of your normal password. If that happens, ask a teammate for help creating one, or ask the owner to make the repo public.

### D3. Enter the project folder

```bash
cd NEXUS-LOCAL
```

Confirm you are in the right place:

```bash
ls
```

(On Windows Command Prompt use `dir` instead of `ls`.)

You should see files like:

- `docker-compose.yml`
- `README.md`
- `.env.example`
- folders like `app`, `db`, `scripts`

---

## Part E — Add the secret `.env` file

The `.env` file is **not** stored on GitHub (on purpose — it contains secrets).

Someone on the team must share a `.env` file with you privately (email attachment, AirDrop, USB, password manager, etc.).

### E1. Put `.env` in the correct folder

The file must be named exactly:

```text
.env
```

And it must sit in the **same folder** as `docker-compose.yml`:

```text
Desktop/NEXUS-LOCAL/.env
```

### E2. Easy way to place it (Mac)

1. Receive the `.env` file.
2. Open Finder → Desktop → `NEXUS-LOCAL`
3. Drag `.env` into that folder
4. If Mac hides files starting with a dot, ask a teammate to help confirm it is there, or in Terminal run:

```bash
ls -la .env
```

If you see `.env` listed, you are good.

### E3. Easy way to place it (Windows)

1. Receive the `.env` file.
2. Open File Explorer → Desktop → `NEXUS-LOCAL`
3. Copy `.env` into that folder
4. In PowerShell (inside `NEXUS-LOCAL`) run:

```bash
dir .env
```

If it lists `.env`, you are good.

### E4. If nobody shared a `.env` yet

You can create a starter file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```bash
Copy-Item .env.example .env
```

Then ask a teammate for the real API keys to paste into `.env`.  
Without keys, the app may open, but resume upload / calling may not work.

---

## Part F — Start Nexus (the “run” step)

Make sure:

1. Docker Desktop is open and **running**
2. Your terminal is inside the `NEXUS-LOCAL` folder

Then run:

```bash
docker compose up -d --build
```

### What this does

- Downloads required images (first time only)
- Builds the Nexus app
- Starts all services in the background

### How long does it take?

- First time: often **5–15 minutes** (sometimes longer on slow internet)
- Later starts: usually much faster

### How to know it worked

Run:

```bash
docker compose ps
```

You want to see services listed as **running** / **up**, especially:

- `app`
- `db`
- `redis`
- `storage`
- `caddy`
- `worker` (optional for basic browsing, needed for call processing)

If something failed, scroll up in the terminal for red error text and send that to a teammate.

---

## Part G — Open Nexus in your browser

1. Open Chrome / Safari / Edge / Firefox
2. In the address bar, type exactly:

```text
http://localhost
```

3. Press Enter

### Login

- Password is whatever is in your `.env` as `APP_PASSWORD`
- Team default is often: `supersecretpassword`

If that URL does not work, try:

```text
http://localhost:3000
```

### Useful links

| Address | What it is |
|---------|------------|
| http://localhost | Main Nexus app (preferred) |
| http://localhost:3000 | Same app, direct access |
| http://localhost:9001 | File storage console (MinIO) |

MinIO login (if needed):

- Username: `admin`
- Password: `password123`  
  (unless your shared `.env` changed these)

### If another app on your computer already uses these ports

Nexus reads its ports from `.env`, so you can move it without editing any code. Open `.env` and set:

```env
HTTP_PORT=8080
HTTPS_PORT=8443
APP_PORT=3001
```

Then restart:

```bash
docker compose up -d
```

Nexus now lives at **http://localhost:8080** (and http://localhost:3001 for direct access). Pick any free numbers you like — just use the same ones in your browser.

---

## Part H — What you can do once it is running

1. Click **Candidates**
2. Upload a resume (PDF or DOCX)
3. Open a candidate profile
4. Change status / add notes
5. Use the search bar to filter candidates

Live phone calling needs extra Telnyx + tunnel setup. Ask a teammate before trying calls.

---

## Everyday commands (after first setup)

Open Terminal / PowerShell, go to the project:

**Mac**

```bash
cd ~/Desktop/NEXUS-LOCAL
```

**Windows**

```bash
cd ~\Desktop\NEXUS-LOCAL
```

Then:

### Start Nexus

```bash
docker compose up -d
```

### Stop Nexus (keeps your data)

```bash
docker compose down
```

This stops containers but **does not delete** your candidates, notes, resumes, or call history.

---

## Part I — Updating without losing your data (read this carefully)

This is one of the most important sections. Many people worry that `git pull` will wipe their candidates. **It will not** — if you follow the safe steps below.

### Where your data actually lives

When you use Docker, Nexus stores your real data in **Docker volumes** on your computer — not inside the GitHub repo folder.

| What | Where it is stored |
|------|--------------------|
| Candidates, notes, call records | Docker volume `pgdata` (Postgres database) |
| Resumes, recordings, PDFs | Docker volume `miniodata` (MinIO storage) |
| Temporary queue data | Docker volume `redisdata` |

Your `.env` file also stays on your computer. It is **not** downloaded from GitHub (and git will not overwrite it when you pull).

**`git pull` only updates code files** (the app, README, etc.). It does **not** touch Docker volumes, so your data stays safe.

### Safe update (recommended — no data loss)

Use this whenever the team pushes new code to GitHub:

```bash
cd ~/Desktop/NEXUS-LOCAL          # or wherever you cloned the repo
git pull
docker compose up -d --build
```

That is it. Your candidates, notes, and uploads should still be there after the rebuild.

### Commands that are SAFE (data kept)

| Command | What it does | Data lost? |
|---------|----------------|------------|
| `git pull` | Downloads new code from GitHub | **No** |
| `docker compose up -d --build` | Rebuilds and restarts the app | **No** |
| `docker compose down` | Stops everything | **No** |
| `docker compose restart app` | Restarts one service | **No** |
| Closing Docker Desktop (then reopening) | Pauses containers | **No** (volumes remain) |

### Commands that DELETE data (avoid unless you mean to)

| Command | What it does | Data lost? |
|---------|----------------|------------|
| `docker compose down -v` | Stops **and wipes all volumes** | **YES — everything gone** |
| Deleting Docker volumes manually in Docker Desktop | Wipes storage | **YES** |
| `docker volume rm ...` | Deletes a specific volume | **YES** |
| Deleting the `NEXUS-LOCAL` folder **without** backing up | You lose `.env` and local config | **Partial** (Docker volumes may survive if not removed) |

> **Golden rule:** Never run `docker compose down -v` unless you intentionally want a completely fresh empty Nexus with zero candidates.

### If a teammate added a database migration

Sometimes new features need a one-time SQL update on an **existing** database (not a brand-new install).

If the README or a teammate says to run a migration file, do this **once** after `git pull`:

```bash
docker compose exec -T db psql -U nexus -d nexus < db/migrate-day1.sql
```

Replace the filename with whatever migration they mention. This updates the database structure **without** deleting your rows.

Fresh installs (first time ever, or after `down -v`) run `db/init.sql` automatically — you usually do not need manual migrations then.

### Extra-safe update (optional, for peace of mind)

If you want to be cautious before a big update:

1. Make sure Nexus is running.
2. Open the app and confirm your candidates are visible (quick sanity check).
3. Run the safe update:

```bash
git pull
docker compose up -d --build
```

4. Refresh the browser and confirm candidates are still there.

You do **not** need to stop Nexus before `git pull`. Stopping first is optional.

### What if something goes wrong after an update?

1. Check containers: `docker compose ps`
2. Check logs: `docker compose logs -f app`
3. Ask a teammate before running `docker compose down -v`
4. Your data is still in Docker volumes until someone runs `-v` or deletes volumes

---

## Everyday commands (continued)

### See if containers are running

```bash
docker compose ps
```

### Update to newest code from GitHub (safe — keeps your data)

```bash
git pull
docker compose up -d --build
```

See **Part I** above for the full explanation of why this does not delete your candidates.

### View app errors/logs

```bash
docker compose logs -f app
```

(Press `Ctrl + C` to stop watching logs.)

### Full reset (WARNING: deletes local Nexus data on this computer)

```bash
docker compose down -v
docker compose up -d --build
```

Only do this if a teammate tells you to.

---

## Do people need SSH to clone?

### Short answer

**No.** Beginners should use HTTPS:

```bash
git clone https://github.com/jatinSharma-create/NEXUS-LOCAL.git
```

### When is SSH needed?

Only if someone prefers SSH, or their company requires it. That needs extra steps:

1. Create an SSH key on your computer
2. Add the public key to your GitHub account
3. Clone with:

```bash
git clone git@github.com:jatinSharma-create/NEXUS-LOCAL.git
```

You can ignore SSH completely if HTTPS works.

---

## Common problems (and fixes)

### “docker: command not found”

- Open Docker Desktop and wait until it is fully running
- Close and reopen Terminal/PowerShell
- Try again

### Browser says site can’t be reached

1. Confirm Docker is running: `docker compose ps`
2. Try http://localhost:3000
3. Wait 30–60 seconds after starting (app may still be booting)
4. Run: `docker compose up -d`

### Port 80 (or 3000) is already in use

Another program on your computer owns that port. Open `.env`, add or edit these lines, then run `docker compose up -d`:

```env
HTTP_PORT=8080
HTTPS_PORT=8443
APP_PORT=3001
```

Then open **http://localhost:8080** instead. To see what is using a port:

```bash
# Mac
lsof -nP -iTCP:80 -sTCP:LISTEN

# Windows PowerShell
netstat -ano | findstr :80
```

### Login fails

- Check `APP_PASSWORD` inside your `.env`
- Default team password is often `supersecretpassword`

### Resume upload fails

- Your `.env` is missing a Gemini API key (`GOOGLE_GENERATIVE_AI_API_KEY`)
- Ask the teammate who shared `.env` to confirm keys are filled

### “Permission denied” or private repo errors while cloning

- Repo may be private
- Ask the owner to invite your GitHub username, or make the repo public

### I can’t see the `.env` file in Finder/File Explorer

Files starting with `.` are often hidden. Use:

```bash
ls -la .env
```

---

## Privacy & safety rules

- Do **not** upload `.env` to GitHub
- Do **not** paste API keys into public chats
- Do **not** screenshot `.env` into Discord/Slack public channels
- Each computer has its **own local data** (candidates do not auto-sync between laptops)

---

## Quick checklist

**Setup**

- [ ] Docker Desktop installed and running
- [ ] `docker --version` works
- [ ] Git installed (`git --version` works)
- [ ] Project cloned into `NEXUS-LOCAL`
- [ ] `.env` file placed inside `NEXUS-LOCAL`
- [ ] Ran `docker compose up -d --build`
- [ ] `docker compose ps` shows app, db, redis, storage, caddy, worker
- [ ] Opened http://localhost
- [ ] Logged in with `APP_PASSWORD`

**Prove it actually works**

- [ ] Uploaded a resume (PDF or DOCX) and a candidate appeared → Gemini key is good
- [ ] Typed in the search bar and the list filtered
- [ ] Opened a candidate, changed their status in the dropdown
- [ ] Added a note and it showed with a timestamp
- [ ] Refreshed the page and everything was still there → database is working

If all boxes are checked, your install matches a working one.

Calling is the only feature that needs extra setup beyond this — see the note in **Part H**.

---

## Need help?

Send a teammate:

1. Your computer type (Mac or Windows)
2. The exact command you ran
3. The full error message (copy/paste text is best)
4. Output of:

```bash
docker compose ps
```
