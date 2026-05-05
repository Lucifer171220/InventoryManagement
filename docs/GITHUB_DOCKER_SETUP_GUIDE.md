# Complete Guide: GitHub Setup, Docker Image Creation & Project Documentation

This document provides a detailed, step-by-step walkthrough for pushing your AI Inventory Manager project to GitHub, building Docker images, configuring `.gitignore`, updating `requirements.txt`, and writing a repository description that helps others understand your project.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Step 1 — Initialize Git and Push to GitHub](#2-step-1--initialize-git-and-push-to-github)
3. [Step 2 — What to Include in GitHub vs .gitignore](#3-step-2--what-to-include-in-github-vs-gitignore)
4. [Step 3 — .gitignore Configuration Explained](#4-step-3--gitignore-configuration-explained)
5. [Step 4 — Requirements.txt Explained](#5-step-4--requirementstxt-explained)
6. [Step 5 — Docker Image Creation](#6-step-5--docker-image-creation)
7. [Step 6 — Docker Compose Full Setup](#7-step-6--docker-compose-full-setup)
8. [Step 7 — GitHub Repository Description & Metadata](#8-step-7--github-repository-description--metadata)
9. [Step 8 — Post-Push Best Practices](#9-step-8--post-push-best-practices)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

Before starting, make sure you have the following installed and configured:

| Tool | Purpose | Install Link |
|------|---------|-------------|
| Git | Version control | https://git-scm.com |
| GitHub CLI (`gh`) | Optional, for PR/repo creation from terminal | https://cli.github.com |
| Docker | Building & running containers | https://docker.com |
| Docker Compose | Multi-container orchestration | Included with Docker Desktop |
| Python 3.12+ | Backend runtime | https://python.org |
| Node.js 20+ | Frontend build | https://nodejs.org |

**GitHub Account Setup:**

```bash
# Check Git is installed
git --version

# Configure your identity (only needed once per machine)
git config --global user.name "Your Full Name"
git config --global user.email "your-email@example.com"

# Authenticate with GitHub (choose one method):
# Option A: HTTPS with credential manager
git config --global credential.helper manager

# Option B: SSH key (more secure, no password prompts)
ssh-keygen -t ed25519 -C "your-email@example.com"
# Then add ~/.ssh/id_ed25519.pub to GitHub → Settings → SSH Keys

# Option C: GitHub CLI
gh auth login
```

---

## 2. Step 1 — Initialize Git and Push to GitHub

### 2.1 Initialize the Git Repository

```bash
# Navigate to your project root
cd E:\2026-04-23-i-have-to-create-a-regarding

# Initialize a new git repository
git init

# This creates a hidden .git folder that tracks all version history
# Verify it was created
ls -la .git
```

### 2.2 Stage All Files

```bash
# Stage every file (respecting .gitignore)
git add -A

# Verify what will be committed — review this carefully!
git status

# You should see files like:
#   new file:   .gitignore
#   new file:   backend/Dockerfile
#   new file:   backend/requirements.txt
#   new file:   backend/.env.example
#   new file:   backend/app/...
#   new file:   frontend/Dockerfile
#   new file:   frontend/nginx.conf
#   new file:   frontend/package.json
#   new file:   frontend/src/...
#   new file:   docker-compose.yml
#   new file:   README.md
#
# You should NOT see:
#   node_modules/     (excluded by .gitignore)
#   __pycache__/      (excluded by .gitignore)
#   .env              (excluded by .gitignore)
#   *.db, *.sqlite3   (excluded by .gitignore)
```

**If you see files that should be excluded**, update `.gitignore` before committing:

```bash
# Unstage any accidentally staged files
git reset HEAD <file-path>

# Or if you need to remove a file already tracked by git:
git rm --cached <file-path>
```

### 2.3 Create the First Commit

```bash
git commit -m "Initial commit: AI Inventory Manager with FastAPI, React, Ollama, and ComfyUI"
```

**Commit message conventions:**
- Use present tense ("add feature" not "added feature")
- Keep the first line under 72 characters
- Optionally add a body for more detail:

```bash
git commit -m "Initial commit: AI Inventory Manager" -m "Full-stack inventory management with FastAPI backend, React frontend, MSSQL database, Ollama AI chat, and ComfyUI image generation"
```

### 2.4 Create the GitHub Repository

**Option A: Using the GitHub website (recommended for beginners)**

1. Go to https://github.com/new
2. Fill in the form:
   - **Repository name**: `ai-inventory-manager`
   - **Description**: `Intelligent inventory management with FastAPI + React. AI-powered chat (Ollama), image generation (ComfyUI), real-time analytics, and role-based auth.`
   - **Visibility**: Public (if you want others to see it) or Private
   - **DO NOT** check "Initialize with README" — you already have code locally
   - **DO NOT** add `.gitignore` or `license` via GitHub — you already have them
3. Click "Create repository"

**Option B: Using the GitHub CLI**

```bash
# Create a public repository
gh repo create ai-inventory-manager --public --description "Intelligent inventory management with FastAPI + React. AI-powered chat, image generation, real-time analytics."

# Create a private repository
gh repo create ai-inventory-manager --private --description "Intelligent inventory management with FastAPI + React."
```

### 2.5 Connect Local Repo to GitHub and Push

```bash
# Add the remote origin (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/ai-inventory-manager.git

# If using SSH:
# git remote add origin git@github.com:YOUR_USERNAME/ai-inventory-manager.git

# Verify the remote
git remote -v

# Rename the default branch to "main" (GitHub's standard)
git branch -M main

# Push your code to GitHub
git push -u origin main
```

**What each command does:**
- `git remote add origin` — tells Git where the remote repository lives
- `git branch -M main` — renames your current branch to "main" (GitHub's default)
- `git push -u origin main` — uploads your commits and sets up tracking (`-u`) so future pushes only need `git push`

### 2.6 Subsequent Pushes (After Making Changes)

```bash
# Check what changed
git status

# Stage specific files
git add backend/app/main.py frontend/src/App.jsx

# Or stage everything
git add -A

# Commit with a meaningful message
git commit -m "Add product image generation endpoint"

# Push to GitHub
git push
```

---

## 3. Step 2 — What to Include in GitHub vs .gitignore

### 3.1 Files That MUST Be Included in GitHub

These are the files other developers need to understand, build, and run your project:

| File/Folder | Why It Belongs in GitHub |
|-------------|--------------------------|
| `backend/app/` | All Python source code — routes, models, services, schemas |
| `backend/app/main.py` | Entry point for the FastAPI application |
| `backend/app/routes/` | API endpoint definitions |
| `backend/app/models/` | SQLAlchemy database models |
| `backend/app/services/` | Business logic (AI, email, ComfyUI, etc.) |
| `backend/app/schemas/` | Pydantic request/response schemas |
| `frontend/src/` | All React component source code |
| `frontend/public/` | Static assets served by Vite |
| `frontend/index.html` | HTML entry point for the SPA |
| `frontend/package.json` | Lists all npm dependencies and scripts |
| `frontend/vite.config.js` | Vite build configuration |
| `backend/requirements.txt` | Lists all Python dependencies with versions |
| `backend/.env.example` | Template showing required environment variables (NO secrets) |
| `backend/Dockerfile` | Instructions to build the backend Docker image |
| `frontend/Dockerfile` | Instructions to build the frontend Docker image |
| `frontend/nginx.conf` | Nginx configuration for serving the SPA and proxying API |
| `docker-compose.yml` | Multi-container orchestration config |
| `alembic/` | Database migration scripts |
| `alembic.ini` | Alembic configuration |
| `scripts/` | Utility scripts (seeding, backups, etc.) |
| `backend/workflows/` | ComfyUI workflow JSON files for image generation |
| `.gitignore` | Tells Git which files to exclude |
| `README.md` | Project documentation — the first thing people see |
| `LICENSE` | Open source license (MIT in your case) |

### 3.2 Files That MUST Be Excluded (.gitignore)

These files should NEVER be pushed to GitHub — they contain secrets, are machine-specific, or are generated automatically:

| File/Folder | Why It Must Be Excluded |
|-------------|------------------------|
| `backend/.env` | Contains DATABASE_URL with passwords, JWT secrets, SMTP credentials |
| `*.pem`, `*.key` | SSL certificates and private keys |
| `secrets.yaml`, `secrets.json` | Any file named "secrets" |
| `node_modules/` | Installed npm packages — regenerated with `npm install` (huge size) |
| `__pycache__/` | Python bytecode cache — auto-regenerated |
| `*.pyc`, `*.pyo` | Compiled Python files |
| `venv/`, `.venv/`, `env/` | Python virtual environments — machine-specific |
| `.vscode/`, `.idea/` | IDE settings — personal preferences, not project config |
| `*.db`, `*.sqlite3` | Database files — contain runtime data, not code |
| `dist/`, `build/` | Build output — regenerated with `npm run build` |
| `uploads/`, `media/` | User-uploaded files — runtime data |
| `.DS_Store` | macOS metadata file |
| `Thumbs.db` | Windows thumbnail cache |
| `*.log` | Log files — runtime output |
| `.npm` | npm cache directory |

### 3.3 The .env.example Pattern

**Why `.env` is excluded but `.env.example` is included:**

- `.env` has your REAL passwords, API keys, and secrets → **EXCLUDED**
- `.env.example` has placeholder values like `your-secret-key-here` → **INCLUDED**

This lets other developers know what environment variables they need to set, without exposing your actual secrets.

Your `.env.example` looks like this:
```
DATABASE_URL=mssql+pyodbc://user:password@localhost\SQLEXPRESS02/inventory_ai?driver=...
JWT_SECRET_KEY=your-long-random-secret-key-here
SMTP_PASSWORD=
COMFYUI_BASE_URL=http://127.0.0.1:8188
```

When someone clones your repo, they copy it:
```bash
cp .env.example .env
# Then fill in their real values in .env
```

---

## 4. Step 3 — .gitignore Configuration Explained

Your project's `.gitignore` file is located at the root: `E:\2026-04-23-i-have-to-create-a-regarding\.gitignore`

Here is the complete configuration with explanations for each section:

```gitignore
# ============================================
# Python-specific exclusions
# ============================================
__pycache__/          # Python caches imported modules as .pyc files in __pycache__ dirs
                     # These are auto-generated and differ per Python version
*.py[cod]            # Matches .pyc, .pyo, .pyd files (compiled Python)
*$py.class           # Java-style class files that some Python tools generate
*.so                 # Shared object files (C extensions compiled on your machine)
.Python              # Python framework symlink (macOS)
*.egg-info/          # Metadata directory created by setuptools when you install a package
.eggs/               # Directory where eggs are installed during build
*.egg                # Python egg files (packaged distributions)
.pytest_cache/       # Cache directory for pytest test runner
.coverage            # Coverage.py data file (code coverage reports)
htmlcov/             # HTML coverage report output directory
dist/                # Distribution output (wheels, sdists)
build/               # Build directory for Python packages

# ============================================
# Virtual environments
# ============================================
venv/                # Standard Python venv directory
env/                 # Common alternative name
.venv/               # Another common convention
                     # Virtual environments contain symlinks to your system Python
                     # and installed packages — they are machine-specific and huge

# ============================================
# Environment files (keep .env.example)
# ============================================
.env                 # The ACTUAL .env file with real secrets — NEVER commit this
*.env.local          # Local override files like .development.env.local
                     # .env.example is NOT excluded — it contains only placeholder values
                     # so other developers know what variables to set

# ============================================
# IDE and editor files
# ============================================
.idea/               # JetBrains IDE (PyCharm, WebStorm) project settings
.vscode/             # Visual Studio Code workspace settings
                     # These contain personal preferences like theme, keybindings
                     # and machine-specific paths that vary per developer
*.swp                # Vim swap files (created when editing a file)
*.swo                # Vim swap files (alternate)
*~                   # Backup files created by some editors

# ============================================
# Node.js (Frontend)
# ============================================
node_modules/        # Installed npm packages — can be 100MB+ and are regenerated by npm install
                     # This is the single most important exclusion for frontend projects
npm-debug.log*       # Debug logs from npm (created on install errors)
yarn-debug.log*      # Debug logs from yarn
yarn-error.log*      # Error logs from yarn
pnpm-debug.log*      # Debug logs from pnpm
.npm                 # npm cache directory

# ============================================
# Build outputs
# ============================================
dist/                # Vite/webpack build output (frontend)
                     # Regenerated by npm run build — no need to version it
build/               # General build directory
out/                 # Alternative build output directory

# ============================================
# Operating system files
# ============================================
.DS_Store            # macOS Finder metadata (stores folder view options)
                     # This file appears automatically on macOS and is useless on other OS
Thumbs.db            # Windows thumbnail cache for folder previews
                     # Auto-generated by Windows Explorer

# ============================================
# Logs
# ============================================
*.log                # Application log files — runtime output, not source code
logs/                # Directory containing log files

# ============================================
# Database files
# ============================================
*.db                 # SQLite database files — contain runtime data
*.sqlite3            # SQLite3 database files
                     # Database files should never be in version control
                     # Use migrations (alembic/) to version the SCHEMA instead

# ============================================
# Uploads and media
# ============================================
uploads/             # User-uploaded files at runtime
media/               # Generated media (charts, product images)
                     # These are runtime artifacts, not source code

# ============================================
# Python cache (redundant but explicit)
# ============================================
*.pyc                # Compiled Python bytecode — auto-generated on import
```

**Important .gitignore rules:**
1. `.gitignore` only prevents **untracked** files from being added. If a file was already committed before adding it to `.gitignore`, it will continue to be tracked. To fix this:
   ```bash
   git rm --cached <file>   # Removes from Git tracking but keeps on disk
   git commit -m "Stop tracking <file>"
   ```
2. Patterns are relative to the `.gitignore` file's location
3. You can have `.gitignore` files in subdirectories (e.g., `backend/.gitignore`) for directory-specific rules
4. Lines starting with `#` are comments
5. `!` negates a pattern (e.g., `!.env.example` would explicitly include it even if `.env*` is excluded)

---

## 5. Step 4 — Requirements.txt Explained

Your `backend/requirements.txt` lists every Python package your backend needs, with exact version pins:

```
fastapi==0.116.1            # The web framework — handles HTTP routing, dependency injection, OpenAPI docs
uvicorn[standard]==0.35.0   # ASGI server that runs the FastAPI app — [standard] includes httptools & uvloop for speed
sqlalchemy==2.0.43          # ORM — maps Python classes to database tables, handles queries
pyodbc==5.2.0               # ODBC driver — allows Python to connect to Microsoft SQL Server
pydantic-settings==2.10.1   # Settings management — reads .env variables into typed Python config objects
python-jose[cryptography]==3.5.0  # JWT token encoding/decoding — [cryptography] adds RSA/ECDSA support
passlib[bcrypt]==1.7.4      # Password hashing library — [bcrypt] adds the bcrypt hash algorithm
bcrypt<4.1                  # Direct bcrypt dependency — pinned below 4.1 for passlib compatibility
httpx==0.28.1               # Async HTTP client — used to call Ollama API and ComfyUI API
python-multipart==0.0.20    # Handles multipart/form-data — required for FastAPI file uploads
email-validator==2.2.0      # Validates email format — used by Pydantic email fields and user registration
reportlab==4.0.9            # PDF generation — creates downloadable inventory reports
openpyxl==3.1.5             # Excel (.xlsx) file handling — read/write spreadsheet reports
python-dotenv==1.0.0        # Loads .env file variables into os.environ at startup
websockets==13.0            # WebSocket protocol — used for real-time features (AI chat streaming)
matplotlib==3.9.2           # Chart generation — creates inventory analytics visualizations saved as images
```

### Why Pin Exact Versions?

- `fastapi==0.116.1` means "install exactly version 0.116.1"
- Without pins (`fastapi`), pip installs the latest version, which may break your code when a new major version is released
- The `==` pin ensures every install is identical — critical for Docker builds

### How to Regenerate requirements.txt

If you add new Python imports in the future:

```bash
# Option 1: Manually add the package with version
echo "new-package==1.0.0" >> backend/requirements.txt

# Option 2: Auto-generate from your installed environment
pip freeze > backend/requirements.txt
# WARNING: This includes ALL installed packages, including ones you may not use

# Option 3: Use pip-tools (recommended for production)
pip install pip-tools
pip-compile backend/requirements.in --output-file backend/requirements.txt
```

### How Each Package Is Used in Your Code

| Package | Where It's Used in Your Project |
|---------|--------------------------------|
| `fastapi` | `backend/app/main.py` — creates the `app = FastAPI()` instance; all route files use `APIRouter` |
| `uvicorn` | Terminal command `uvicorn app.main:app --reload` to start the server |
| `sqlalchemy` | `backend/app/models/` — defines database tables as Python classes; `backend/app/database.py` — engine & session |
| `pyodbc` | Required by SQLAlchemy to connect to MSSQL via the `mssql+pyodbc://` dialect |
| `pydantic-settings` | `backend/app/config.py` — loads `.env` variables into a `BaseSettings` class |
| `python-jose` | `backend/app/routes/auth.py` — creates and verifies JWT tokens for user authentication |
| `passlib` + `bcrypt` | `backend/app/routes/auth.py` — hashes passwords with `CryptContext(schemes=["bcrypt"])` |
| `httpx` | `backend/app/services/ollama_service.py` — async calls to Ollama API; `backend/app/services/comfyui_service.py` — calls to ComfyUI |
| `python-multipart` | File upload endpoints (e.g., CSV import, profile images) |
| `email-validator` | Pydantic schemas with `EmailStr` type for user registration/login |
| `reportlab` | PDF report generation for inventory summaries |
| `openpyxl` | Excel export of inventory data |
| `python-dotenv` | `backend/app/config.py` — `load_dotenv()` to read `.env` file |
| `websockets` | Real-time AI chat streaming — server pushes tokens as Ollama generates them |
| `matplotlib` | `backend/app/services/` — generates chart images (bar charts, pie charts) for the dashboard |

---

## 6. Step 5 — Docker Image Creation

### 6.1 What Is a Docker Image?

A Docker image is a lightweight, standalone package that contains everything needed to run a piece of software:
- The operating system (e.g., `python:3.12-slim`, `node:20-alpine`)
- The application code
- All dependencies (pip packages, npm packages)
- Runtime configuration

Images are built from a `Dockerfile` — a text file with step-by-step instructions.

### 6.2 Backend Dockerfile (Detailed Explanation)

File: `backend/Dockerfile`

```dockerfile
# Line 1: Base image — Python 3.12 slim variant (Debian-based, ~150MB vs ~900MB for full)
# "slim" removes non-essential packages to keep the image small
FROM python:3.12-slim

# Line 2: Set working directory inside the container
# All subsequent COPY, RUN, etc. commands happen relative to this directory
WORKDIR /app

# Lines 5-8: Install system-level dependencies
# gcc is needed because some Python packages (like pyodbc) compile C code during install
# rm -rf /var/lib/apt/lists/* cleans the apt cache to reduce image size
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Lines 10-12: Copy and install Python dependencies FIRST
# This is a Docker optimization: Docker caches each layer (step result)
# By copying requirements.txt before the app code, dependency installation
# is cached. When you change app code but not requirements, Docker reuses
# the cached pip install layer — saving minutes on every rebuild
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# --no-cache-dir prevents pip from storing download cache, reducing image size

# Lines 14-16: Copy application code
# app/ contains your FastAPI routes, models, services, schemas
# workflows/ contains the ComfyUI JSON workflow for image generation
COPY app/ ./app/
COPY workflows/ ./workflows/

# Lines 18-19: Create directories for generated content
# Charts (matplotlib) and product images (ComfyUI) will be saved here
RUN mkdir -p /app/app/static/charts /app/app/static/product_images

# Line 21: Document that the container listens on port 8000
# This is informational — it doesn't actually publish the port
# You still need -p 8000:8000 when running the container
EXPOSE 8000

# Line 23: The command that runs when the container starts
# --host 0.0.0.0 makes the server listen on all network interfaces
# (by default, uvicorn only listens on 127.0.0.1 which is inaccessible
# from outside the container)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 6.3 Frontend Dockerfile (Detailed Explanation)

File: `frontend/Dockerfile`

```dockerfile
# === STAGE 1: BUILD ===
# Line 1: "AS builder" names this stage — we can reference it later
# node:20-alpine uses Alpine Linux (~50MB vs ~350MB for node:20)
# Alpine is minimal — just enough to run Node.js
FROM node:20-alpine AS builder

# Line 2: Working directory for the build stage
WORKDIR /app

# Lines 3-4: Copy package files and install dependencies
# package*.json matches both package.json and package-lock.json
# npm ci (Clean Install) uses package-lock.json for exact versions
# It's faster and more reliable than npm install for CI/CD
COPY package*.json ./
RUN npm ci

# Lines 5-6: Copy source code and build the production bundle
# This creates the dist/ directory with optimized, minified files
COPY . .
RUN npm run build

# === STAGE 2: SERVE ===
# Line 8: Start a completely new stage from nginx:alpine (~25MB)
# This is the "multi-stage build" pattern — the builder stage's
# node_modules and source code are discarded. Only the dist/ output
# is carried forward. This dramatically reduces the final image size
# (from ~500MB with Node.js to ~25MB with Nginx)
FROM nginx:alpine

# Line 9: Copy the build output from the builder stage
# --from=builder references the named stage above
# /app/dist is where Vite puts the production build
# /usr/share/nginx/html is where Nginx serves files from by default
COPY --from=builder /app/dist /usr/share/nginx/html

# Line 10: Copy our custom Nginx configuration
# This configures SPA routing (try_files) and API proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Line 11: Document that the container listens on port 80
EXPOSE 80

# Line 12: Start Nginx in the foreground
# -g "daemon off;" prevents Nginx from running as a background daemon
# Docker containers stop when the main process exits, so we need
# Nginx to stay in the foreground
CMD ["nginx", "-g", "daemon off;"]
```

### 6.4 Frontend Nginx Configuration (Detailed Explanation)

File: `frontend/nginx.conf`

```nginx
server {
    listen 80;              # Nginx listens on port 80 (standard HTTP port)
    server_name localhost;  # Responds to requests for localhost

    # Location block for serving the React SPA
    location / {
        root /usr/share/nginx/html;   # Serve static files from this directory
        index index.html;             # Default file to serve
        try_files $uri $uri/ /index.html;
        # try_files is CRITICAL for Single Page Applications:
        # 1. Try to serve the exact file requested (e.g., /assets/logo.png)
        # 2. If not found, try it as a directory (e.g., /products/ → /products/index.html)
        # 3. If still not found, serve index.html — this lets React Router handle the URL
        # Without this, refreshing on /products would return 404 from Nginx
    }

    # Location block for proxying API requests to the backend
    location /api {
        proxy_pass http://backend:8000;
        # "backend" is the Docker Compose service name — Docker resolves it
        # to the backend container's IP address automatically
        # Requests to /api/... are forwarded to http://backend:8000/api/...

        proxy_set_header Host $host;
        # Passes the original Host header so the backend knows the domain

        proxy_set_header X-Real-IP $remote_addr;
        # Passes the client's real IP (without this, backend sees Nginx's IP)
    }
}
```

### 6.5 Building Docker Images Manually

```bash
# === Build the Backend Image ===
# -t gives the image a name:tag format
# The trailing ./backend tells Docker where to find the Dockerfile
docker build -t yourusername/ai-inventory-backend:latest ./backend

# === Build the Frontend Image ===
docker build -t yourusername/ai-inventory-frontend:latest ./frontend

# === Verify the images were created ===
docker images | grep ai-inventory

# === Test an image locally ===
# Backend (note: needs a database to connect to)
docker run -p 8000:8000 --env-file backend/.env yourusername/ai-inventory-backend:latest

# Frontend
docker run -p 5173:80 yourusername/ai-inventory-frontend:latest
# Then open http://localhost:5173 in your browser
```

### 6.6 Pushing Docker Images to Docker Hub

```bash
# 1. Create a Docker Hub account at https://hub.docker.com
# 2. Log in from the terminal
docker login

# 3. Tag your images with your Docker Hub username (if not already named correctly)
# docker tag local-name:tag dockerhub-username/repo-name:tag
docker tag ai-inventory-backend:latest yourusername/ai-inventory-backend:latest
docker tag ai-inventory-frontend:latest yourusername/ai-inventory-frontend:latest

# 4. Push to Docker Hub
docker push yourusername/ai-inventory-backend:latest
docker push yourusername/ai-inventory-frontend:latest

# 5. Anyone can now pull and run your images:
# docker pull yourusername/ai-inventory-backend:latest
# docker pull yourusername/ai-inventory-frontend:latest
```

### 6.7 Docker Image Size Optimization Tips

| Technique | Current Status | Savings |
|-----------|---------------|---------|
| Use `slim`/`alpine` base images | Already using `python:3.12-slim` and `node:20-alpine` | ~500MB+ |
| Multi-stage builds | Frontend uses it (builder → nginx) | ~475MB |
| `--no-cache-dir` in pip | Already configured | ~50-100MB |
| `rm -rf /var/lib/apt/lists/*` | Already configured | ~20MB |
| `.dockerignore` file | **Not yet created** — see below | Varies |

Create `backend/.dockerignore` to exclude files from the Docker build context:

```dockerignore
__pycache__/
*.pyc
.env
.env.local
.venv/
venv/
.pytest_cache/
*.egg-info/
test_api.py
```

Create `frontend/.dockerignore`:

```dockerignore
node_modules/
dist/
.env
.env.local
.vscode/
image/
```

---

## 7. Step 6 — Docker Compose Full Setup

File: `docker-compose.yml`

```yaml
version: '3.8'            # Docker Compose file format version

services:                  # Each service is one container

  # ============================================
  # BACKEND SERVICE
  # ============================================
  backend:
    build: ./backend       # Build from backend/Dockerfile
    ports:
      - "8000:8000"        # Map host port 8000 → container port 8000
                          # Format: "HOST_PORT:CONTAINER_PORT"
    environment:
      # These override any .env file values inside the container
      - DATABASE_URL=mssql+pyodbc://user:password@db:1433/inventory_ai?driver=ODBC+Driver+18+for+SQL+Server
        # Note: "db" is the Docker Compose service name — Docker resolves it
        # to the SQL Server container's IP. This replaces "localhost" from your
        # local .env because containers can't reach each other via localhost
      - JWT_SECRET_KEY=your-secret-key-here
        # In production, use a real random secret: python -c "import secrets; print(secrets.token_urlsafe(32))"
      - OLLAMA_BASE_URL=http://ollama:11434
        # "ollama" is the Docker Compose service name for the Ollama container
    volumes:
      - ./backend/app/static:/app/app/static
        # Mount the static directory from host to container
        # This persists generated charts and product images on your host machine
        # Without this, images would be lost when the container is removed
    depends_on:
      - db                 # Don't start backend until the db service is running
                          # Note: this only waits for the container to start,
                          # NOT for SQL Server to be ready to accept connections

  # ============================================
  # FRONTEND SERVICE
  # ============================================
  frontend:
    build: ./frontend      # Build from frontend/Dockerfile
    ports:
      - "5173:80"          # Host port 5173 (matches your Vite dev port) → container port 80 (nginx)
    depends_on:
      - backend            # Start backend before frontend

  # ============================================
  # DATABASE SERVICE
  # ============================================
  db:
    image: mcr.microsoft.com/mssql/server:2022-latest
                          # Use the official Microsoft SQL Server 2022 image
                          # No Dockerfile needed — pull directly from Microsoft Container Registry
    environment:
      - ACCEPT_EULA=Y      # Required by Microsoft — confirms you accept the license
      - MSSQL_SA_PASSWORD=Strong!Passw0rd
                          # SA (System Administrator) password — must meet SQL Server complexity rules:
                          # At least 8 chars, uppercase, lowercase, digits, special characters
      - MSSQL_PID=Developer
                          # "Developer" edition is free for non-production use
                          # For production, use "Express" (free, 10GB limit) or "Standard"/"Enterprise"
    ports:
      - "1433:1433"        # Expose SQL Server on the default port
                          # Allows connecting with SSMS or Azure Data Studio from host
    volumes:
      - mssql_data:/var/opt/mssql
        # Named volume — persists database files even when the container is removed
        # Without this, all data is lost when you run `docker-compose down`

  # ============================================
  # OLLAMA AI SERVICE
  # ============================================
  ollama:
    image: ollama/ollama:latest
                          # Official Ollama image — runs the LLM server
    ports:
      - "11434:11434"      # Ollama's default API port
    volumes:
      - ollama_data:/root/.ollama
        # Persists downloaded AI models (they can be several GB each)
        # Without this, models are re-downloaded every time the container restarts

# Named volumes — Docker manages these on the host filesystem
# View them with: docker volume ls
# Delete them with: docker volume rm projectname_mssql_data
volumes:
  mssql_data:             # For SQL Server data files
  ollama_data:            # For Ollama AI model files
```

### Docker Compose Commands

```bash
# Build and start all services (detached mode — runs in background)
docker-compose up -d

# Build images fresh before starting (use after code changes)
docker-compose up -d --build

# View running containers
docker-compose ps

# View logs from all services
docker-compose logs -f

# View logs from a specific service
docker-compose logs -f backend

# Stop all services
docker-compose down

# Stop and remove volumes (DELETES all database data and AI models)
docker-compose down -v

# Restart a single service
docker-compose restart backend

# Pull an AI model inside the Ollama container
docker-compose exec ollama ollama pull gemma3:latest

# Open a shell inside the backend container
docker-compose exec backend bash

# Run database migrations inside the backend container
docker-compose exec backend alembic upgrade head
```

---

## 8. Step 7 — GitHub Repository Description & Metadata

### 8.1 Setting the Description on GitHub

1. Go to `https://github.com/YOUR_USERNAME/ai-inventory-manager`
2. On the right side of the repository page, find the **"About"** section
3. Click the **gear icon** next to "About"
4. Fill in the fields:

**Description** (appears next to the repo name in search results — max ~350 characters):
```
Intelligent inventory management with FastAPI + React. AI-powered chat (Ollama), product image generation (ComfyUI), real-time dashboard analytics, role-based auth, and email notifications. Docker-ready.
```

**Website**: If you deploy this somewhere, add the URL here.

**Topics** (tags that help people find your repo — click "Add topic"):
```
fastapi
react
inventory-management
ollama
comfyui
docker
sql-server
ai
llm
image-generation
python
vite
fullstack
```

5. Check the box **"Include in the home page"** if you want the README displayed on the main repo page (highly recommended).

6. Click **"Save"**.

### 8.2 What Makes a Good Repository Description

A good description follows this pattern:

> **[What it is]** + **[Key technologies]** + **[Standout features]**

Examples:
- Too vague: `An inventory app`
- Better: `Inventory management system built with FastAPI and React`
- Best: `Intelligent inventory management with FastAPI + React. AI chat (Ollama), image generation (ComfyUI), real-time analytics, role-based auth. Docker-ready.`

### 8.3 Your README.md

Your `README.md` is the most important file in your repository — it's the first thing visitors see. It should answer:

1. **What is this?** → AI Inventory Manager
2. **What does it do?** → Tracks inventory, AI chat, image generation, analytics
3. **How is it built?** → Tech stack table
4. **How do I run it?** → Quick start with Docker Compose or manual setup
5. **What do I need?** → Prerequisites section
6. **How does the API work?** → Link to Swagger docs
7. **How do I configure it?** → Environment variables table

Your README.md at the project root already contains all of these sections. When you push to GitHub, it will automatically render at the top of your repository page.

### 8.4 Social Preview Image

GitHub allows you to set a custom social preview image (the image that appears when someone shares your repo link on social media):

1. Go to repo → Settings → General
2. Scroll to "Social preview"
3. Upload an image (1280×640 px recommended) — could be a screenshot of your dashboard

---

## 9. Step 8 — Post-Push Best Practices

### 9.1 Branching Strategy

```bash
# Create a feature branch for new work
git checkout -b feature/add-csv-import

# Make changes, commit, push
git add -A
git commit -m "Add CSV import for bulk product upload"
git push -u origin feature/add-csv-import

# Create a Pull Request on GitHub to merge into main
# This allows code review before changes go live
```

### 9.2 Protecting the Main Branch

1. Go to repo → Settings → Branches
2. Add a branch protection rule for `main`
3. Enable "Require pull request reviews before merging"
4. Enable "Require status checks to pass" (if you set up CI/CD)

### 9.3 Adding a .dockerignore (Recommended)

Create `backend/.dockerignore`:
```
__pycache__/
*.pyc
.env
.env.local
.venv/
venv/
.pytest_cache/
*.egg-info/
test_api.py
```

Create `frontend/.dockerignore`:
```
node_modules/
dist/
.env
.env.local
.vscode/
image/
```

This prevents unnecessary files from being sent to the Docker daemon during `docker build`, making builds faster.

### 9.4 GitHub Actions CI/CD (Optional but Recommended)

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r backend/requirements.txt
      - run: cd backend && python -m pytest

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd frontend && npm ci && npm run build
```

### 9.5 Security Checklist

- [ ] `.env` is in `.gitignore` and NOT committed
- [ ] `JWT_SECRET_KEY` uses a strong random value in production
- [ ] `MSSQL_SA_PASSWORD` meets complexity requirements
- [ ] No hardcoded passwords in source code
- [ ] `.env.example` has placeholder values, not real ones
- [ ] GitHub repo is Private if it contains any sensitive logic
- [ ] Enable GitHub Dependabot alerts: repo → Settings → Code security

---

## 10. Troubleshooting

### Git Push Fails

```bash
# Error: "failed to push some refs"
# Cause: Remote has commits you don't have locally
git pull origin main --rebase
git push origin main

# Error: "remote origin already exists"
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/ai-inventory-manager.git
```

### Docker Build Fails

```bash
# Error: "pip install fails" in backend Dockerfile
# Cause: pyodbc needs ODBC headers — add to Dockerfile:
RUN apt-get update && apt-get install -y gcc g++ unixodbc-dev

# Error: "npm ci fails" in frontend Dockerfile
# Cause: package-lock.json is out of date
# Fix locally: cd frontend && npm install && git add package-lock.json
```

### Docker Compose Fails

```bash
# Error: "port 8000 already in use"
# Fix: Find and stop the process using that port
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Or change the port in docker-compose.yml: "8001:8000"

# Error: SQL Server container keeps restarting
# Cause: Password doesn't meet complexity requirements
# Fix: Use a strong password like "MyStr0ng!Passw0rd#2024"
```

### .env File Not Loading

```bash
# Verify the .env file exists in the backend directory
ls backend/.env

# Verify python-dotenv is installed
pip show python-dotenv

# Check for trailing spaces or quotes in .env values
# CORRECT:   JWT_SECRET_KEY=mysecret123
# INCORRECT: JWT_SECRET_KEY="mysecret123"
# INCORRECT: JWT_SECRET_KEY = mysecret123
```

---

## Quick Reference: All Commands in Order

```bash
# ===== GIT SETUP =====
git init
git add -A
git commit -m "Initial commit: AI Inventory Manager"
git remote add origin https://github.com/YOUR_USERNAME/ai-inventory-manager.git
git branch -M main
git push -u origin main

# ===== DOCKER BUILD =====
docker build -t yourusername/ai-inventory-backend:latest ./backend
docker build -t yourusername/ai-inventory-frontend:latest ./frontend

# ===== DOCKER HUB PUSH =====
docker login
docker push yourusername/ai-inventory-backend:latest
docker push yourusername/ai-inventory-frontend:latest

# ===== DOCKER COMPOSE (ALL SERVICES) =====
docker-compose up -d --build

# ===== VERIFY EVERYTHING =====
docker-compose ps                    # Check all containers are running
curl http://localhost:8000/docs      # Test backend API docs
curl http://localhost:5173           # Test frontend
```
