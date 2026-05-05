# AI Inventory Manager

An intelligent inventory management system powered by FastAPI, React, and local AI models (Ollama + ComfyUI).

## Live Demo

The system provides:
- **Real-time inventory tracking** with CRUD operations for products, warehouses, suppliers, and customers
- **AI-powered assistance** using local Ollama models for natural language queries about inventory
- **Product image generation** with ComfyUI for automatically generating product photos
- **Dashboard analytics** with chart visualizations
- **Email notifications** for low stock and order alerts

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│   Database  │
│  (React/Vite)│     │ (FastAPI)   │     │ (MSSQL)     │
└─────────────┘     └─────────────┘     └─────────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │ Local AI Services│
                   │  Ollama + ComfyUI│
                   └──────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, SQLAlchemy, Python 3.12 |
| Frontend | React 18, Vite, Leaflet |
| Database | Microsoft SQL Server |
| AI/Local Models | Ollama (LLM), ComfyUI (Image Generation) |
| Containerization | Docker, Docker Compose |

## Features

- **Inventory Management**: Track products, purchase orders, sales, warehouses
- **AI Chat Assistant**: Ask questions like "Show me products with low stock" in natural language
- **Product Image Generation**: Generate product photos using AI models via ComfyUI
- **Charts & Reports**: Visual analytics for inventory metrics
- **User Roles**: Manager, Moderator, and User permissions
- **Email Service**: Notifications for stock alerts and order updates

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# The API will be available at http://localhost:8000
# The frontend will be available at http://localhost:5173
```

### Option 2: Manual Setup

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Prerequisites

- **Database**: Microsoft SQL Server (Express or higher)
- **Ollama** (optional): For AI chat features - https://ollama.com
- **ComfyUI** (optional): For product image generation - https://github.com/comfyanonymous/ComfyUI

## API Documentation

Once running, access the interactive API docs at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Default Users

| Email | Password | Role |
|-------|----------|------|
| manager@inventory.local | ChangeMe123! | Manager |
| moderator@inventory.local | ChangeMe123! | Moderator |
| user@inventory.local | ChangeMe123! | User |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | SQL Server connection string | See config.py |
| JWT_SECRET_KEY | Secret for JWT tokens | Required in production |
| OLLAMA_BASE_URL | Ollama API endpoint | http://127.0.0.1:11434 |
| COMFYUI_BASE_URL | ComfyUI API endpoint | http://127.0.0.1:8188 |

## License

MIT