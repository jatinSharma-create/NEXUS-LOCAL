# Nexus — Complete beginner setup guide

This guide is for someone who has **never used GitHub, Docker, or coding tools** before.

By the end, you will have Nexus running on your computer and open in your browser.

**What Nexus is:** a local candidate screening web app (upload resumes, search candidates, add notes, make calls).

**Important:** Everything below runs on **your own computer**. Your data stays on your machine.

---

## What you need before starting

- A computer (Mac or Windows)
- Internet connection
- About **30–60 minutes** the first time (downloads can be large)
- Roughly **10 GB free space** on your hard drive (more is better)
- A `.env` file shared with you privately by the team (this contains passwords/API keys)

You do **not** need to know how to code.

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

### Update to newest code from GitHub, then rebuild

```bash
git pull
docker compose up -d --build
```

### See if containers are running

```bash
docker compose ps
```

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

### Port 80 is already in use

Something else on your computer is using port 80. Ask a teammate for help, or use:

```text
http://localhost:3000
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

- [ ] Docker Desktop installed and running
- [ ] `docker --version` works
- [ ] Git installed (`git --version` works)
- [ ] Project cloned into `NEXUS-LOCAL`
- [ ] `.env` file placed inside `NEXUS-LOCAL`
- [ ] Ran `docker compose up -d --build`
- [ ] Opened http://localhost
- [ ] Logged in with `APP_PASSWORD`

If all boxes are checked, you are done.

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
