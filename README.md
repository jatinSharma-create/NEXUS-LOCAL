# Nexus — Local Candidate Screening Platform

Hey! 👋 I built this project to solve a very specific problem I heard from a recruiter: **"Great ideas and candidate details often get lost right after the screening call."**

As a university student, I'm always looking for ways to stay ahead of the curve, especially in this fast-moving era of AI. I wanted to see how quickly and effectively I could build a full-stack solution to this exact problem. So, I used AI tools like **Cursor** to help me write the code, debug issues, and ship this project incredibly fast! 🚀

## 💡 The Problem & The Solution

**The Problem:** Recruiters talk to dozens of candidates. During or right after a call, brilliant insights, notes, and specific resume details get lost in the shuffle of tabs, notebooks, and disconnected software.

**The Solution (Nexus):** A streamlined, local-first web application where you can:
- 📄 **Upload Resumes:** Store and manage candidate PDFs/DOCXs in one place.
- 🔍 **Search Candidates:** Instantly find who you're looking for.
- 📝 **Add Notes & Call Records:** Log insights *during* or immediately after the call so nothing is forgotten.
- 🔒 **Local & Private:** Everything runs on your own computer. Your candidate data never leaves your machine unless you want it to.

Building this taught me a massive amount about integrating different services (Docker, Postgres, MinIO for file storage, and Redis) while utilizing AI to accelerate my development workflow. It’s a perfect example of how students today can leverage AI to solve real-world industry problems quickly.

---

## 🚀 How to Run It (Beginner Friendly)

I made sure this is super easy to run, even if you aren't a developer! It uses Docker to bundle everything up so you don't have to install databases manually.

### 1. Prerequisites
- **Docker Desktop** installed and running on your computer.
- **Git** installed.
- A private `.env` file (you'll need to drop this in the project folder to supply the API keys).

### 2. Setup Steps

Open your terminal or PowerShell and run:

```bash
# 1. Clone the repository
git clone https://github.com/jatinSharma-create/NEXUS-LOCAL.git

# 2. Enter the folder
cd NEXUS-LOCAL

# 3. Add your .env file here!
# (Just drag and drop the .env file into the NEXUS-LOCAL folder)

# 4. Start the app
docker compose up -d --build
```

### 3. Open the App
Once Docker finishes building, open your web browser and go to:
**`http://localhost`**

*(Log in using the password provided in your `.env` file).*

---
*Built with curiosity, coffee, and Cursor. Staying ahead in the AI era by shipping fast! 🎓✨*
