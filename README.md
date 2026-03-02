# Cabinetry Designer — Frontend

React + react-konva 2D authoring canvas with Three.js 3D preview for parametric cabinetry layout.

## Tech Stack

- **React 18** + Vite
- **react-konva** — 2D canvas (wall drawing, object placement, snap)
- **React Three Fiber** — 3D read-only viewer (derived from 2D intent)
- **Redux Toolkit** — state management
- **Tailwind CSS** — styling
- **Supabase** — auth (shared project with ff-job-schedule-v1)
- **Axios** — API client to Node backend

## Getting Started

```bash
# Install dependencies
npm install

# Copy env and fill in values
cp .env.example .env

# Start dev server (port 5174)
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_FF_JS_SUPABASE_URL` | Supabase project URL |
| `VITE_FF_JS_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_API_BASE_URL` | Node backend URL (default: `http://localhost:3001`) |

## Architecture

- `src/canvas/` — Konva stage, wall tool, snap engine, toolbar
- `src/catalog/` — Object catalog panel + static parametric definitions
- `src/store/slices/` — Redux slices (auth, project, room, wall, object, canvas)
- `src/components/properties/` — Property panel for editing selected objects
- `src/three/` — React Three Fiber 3D viewer (Milestone 3)
- `src/api/` — Supabase client + Axios API client

Source of truth is always 2D intent + resolved parameters. 3D is derived, read-only.
