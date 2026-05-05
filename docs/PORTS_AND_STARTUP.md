# Ports and Startup

## Recommended ports

Use separate ports for each local service:

| Service | Port | URL |
|---|---:|---|
| FastAPI backend | `8000` | `http://localhost:8000` |
| React/Vite frontend | `5173` | `http://localhost:5173` |
| Ollama | `11434` | `http://127.0.0.1:11434` |
| ComfyUI | `8188` | `http://127.0.0.1:8188` |

FastAPI and ComfyUI must not both run on `8000`.

## Start FastAPI

From the `backend` folder:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Start frontend

From the `frontend` folder:

```bash
npm run dev -- --host 127.0.0.1
```

## Start Ollama

Ollama normally runs on `11434`:

```bash
ollama serve
```

## Start ComfyUI

From the ComfyUI folder:

```bash
python main.py --listen 0.0.0.0 --port 8188
```

Do not start ComfyUI on `8000` unless you also move FastAPI to another port.

If ComfyUI still starts on `8000`, you are probably starting it from an old shortcut, `.bat` file, terminal history command, or launcher outside this project. This repository cannot change that external launcher. Start it with the explicit command above, or use the helper script below.

From this project root:

```powershell
.\scripts\start_comfyui_8188.ps1 -ComfyUIPath "C:\path\to\ComfyUI"
```

Check which process owns the important ports:

```powershell
.\scripts\check_ports.ps1
```

Check which checkpoints ComfyUI can see:

```powershell
.\scripts\check_comfyui_checkpoints.ps1
```

If port `8000` shows a ComfyUI/Python process, stop that process and restart ComfyUI on `8188`.

## Chrome still shows ComfyUI on 8000

If `.\scripts\check_ports.ps1` says port `8000` is free but Chrome still shows ComfyUI at `http://localhost:8000`, Chrome is showing a stale cached page or an old tab state.

Try these in order:

1. Open a new tab and go to:

```text
http://127.0.0.1:8000/health
```

2. Hard refresh:

```text
Ctrl + Shift + R
```

3. Close all tabs that point to `localhost:8000`.

4. Clear site data for localhost:

```text
chrome://settings/siteData
```

Search for `localhost` and remove stored data.

5. Re-check the port:

```powershell
.\scripts\check_ports.ps1
```

6. If a process owns port `8000`, stop it:

```powershell
Stop-Process -Id <PID>
```

Replace `<PID>` with the value shown by `check_ports.ps1`.

7. Start FastAPI again:

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Where the app is configured

The backend setting is in `backend/app/config.py`:

```python
comfyui_base_url: str = "http://127.0.0.1:8188"
```

You can override it in `backend/.env`:

```env
COMFYUI_BASE_URL=http://127.0.0.1:8188
```

The frontend expects FastAPI here:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

## If you really want ComfyUI on 8000

Then FastAPI must move, for example to `8001`:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

And the frontend must point to:

```env
VITE_API_BASE_URL=http://localhost:8001/api
```

The simpler recommended setup is:

- FastAPI: `8000`
- ComfyUI: `8188`
