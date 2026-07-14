# warehouse-graph-ui

A standalone **Vite + React + TypeScript** application for drawing and simulating a warehouse graph using [React Flow](https://reactflow.dev/).

## Features

- **Interactive graph editor** – drag-and-drop node types onto a canvas, connect them with edges
- **Node types**: `source_gate`, `handover`, `rack_aisle`, `turn`
- **Edge types** with configurable width, length (auto from positions or manual), preset (`rack_aisle`, `head_aisle`, `corridor`, `connector`), priority stream, and intersection count
- **Always-on validation** – checks rack mode consistency (XNA / XQE), scenario rules, branching distances, feasibility of handover paths and storage-leg paths
- **Simulation** – Dijkstra-based routing computes shortest feasible paths and travel times per aisle, with result highlighting on the canvas
- **Deterministic backend simulation runs** – optional `Random Seed` input is sent on every backend run request
- **Backend fleet sizing visibility** – required XPL fleet count is highlighted in backend simulation results
- **Import / Export JSON** – preserves full graph and settings; validated on import with Zod
- **GitHub Pages deployment** ready

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173/warehouse-graph-ui/](http://localhost:5173/warehouse-graph-ui/)

For local UI + local simulator API:

```bash
cp .env.example .env
```

The default `.env.example` points the UI at `http://127.0.0.1:8000`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview the production build locally |
| `npm run deploy` | Build and publish to GitHub Pages |

## Environment Variables

| Variable | Purpose | Example |
|---------|---------|---------|
| `VITE_SIMULATOR_API_BASE_URL` | Base URL for the simulator backend API | `https://sim.example.com` |
| `VITE_APP_BASE_PATH` | Public base path for the built app | `/` or `/warehouse-graph-ui/` |

## Usage

1. **Drag** a node type from the left toolbar onto the canvas.
2. **Connect** nodes by dragging from one node's handle to another.
3. **Select** a node or edge to edit its properties in the right panel.
4. **Fix** any validation errors shown in the Issues tab at the bottom.
5. Switch to the **Simulation** tab and click **▶ Run Simulation** (enabled only when there are no errors).
6. Click a row in the simulation results to highlight that aisle's paths on the canvas.
7. Use **↑ Import** / **↓ Export** in the top bar to save or load graphs as JSON.

### Reproducible simulation scenarios

1. In the **Properties → Simulator Inputs** panel, set **Random Seed** to a fixed integer (for example `42`).
2. Keep the graph and simulator inputs unchanged, then run backend fleet sizing.
3. Re-run with the same seed and scenario. The UI sends the same `random_seed` in each request, enabling deterministic backend comparisons.

## Architecture

```
src/
  graph/        # TypeScript types (NodeData, EdgeData, AppSettings) and utils
  validation/   # Always-on validation rules (all E-*/W-* codes)
  simulation/   # Dijkstra, graph compiler, per-aisle simulation runner
  ui/           # React components (canvas, panels, toolbar, custom nodes)
  store/        # Zustand global state
```

## Deploy to GitHub Pages

```bash
npm run deploy
```

This repo also supports automatic GitHub Pages deployment through GitHub Actions on every push to `main`.

For automatic deployment, set the repo's **Pages** source to **GitHub Actions** in GitHub → Settings → Pages.

If you prefer manual publishing, `npm run deploy` still pushes `dist/` to the `gh-pages` branch.

For GitHub Pages specifically, set:

```bash
VITE_APP_BASE_PATH=/warehouse-graph-ui/
```

## Deploy with a Remote Backend

For a shared team setup:

1. Deploy the backend API from the `age-warehouse-simulator` repo to your Cologne server.
2. Set `VITE_SIMULATOR_API_BASE_URL=https://sim.your-domain.com`.
3. Build and deploy this frontend to Vercel or another static host.

See [DEPLOYMENT.md](/Users/arnabmitra/Documents/Codex/2026-05-05/can-you-help-me-with-my/warehouse-graph-ui/DEPLOYMENT.md) for a simple static-host deployment flow.
