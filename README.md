# warehouse-graph-ui

A standalone **Vite + React + TypeScript** application for drawing and simulating a warehouse graph using [React Flow](https://reactflow.dev/).

## Features

- **Interactive graph editor** – drag-and-drop node types onto a canvas, connect them with edges
- **Node types**: `source_gate`, `handover`, `rack_aisle`, `turn`
- **Edge types** with configurable width, length (auto from positions or manual), preset (`rack_aisle`, `head_aisle`, `corridor`, `connector`), priority stream, and intersection count
- **Always-on validation** – checks rack mode consistency (XNA / XQE), scenario rules, branching distances, feasibility of handover paths and storage-leg paths
- **Simulation** – Dijkstra-based routing computes shortest feasible paths and travel times per aisle, with result highlighting on the canvas
- **Import / Export JSON** – preserves full graph and settings; validated on import with Zod
- **GitHub Pages deployment** ready

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173/warehouse-graph-ui/](http://localhost:5173/warehouse-graph-ui/)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview the production build locally |
| `npm run deploy` | Build and publish to GitHub Pages |

## Usage

1. **Drag** a node type from the left toolbar onto the canvas.
2. **Connect** nodes by dragging from one node's handle to another.
3. **Select** a node or edge to edit its properties in the right panel.
4. **Fix** any validation errors shown in the Issues tab at the bottom.
5. Switch to the **Simulation** tab and click **▶ Run Simulation** (enabled only when there are no errors).
6. Click a row in the simulation results to highlight that aisle's paths on the canvas.
7. Use **↑ Import** / **↓ Export** in the top bar to save or load graphs as JSON.

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

Make sure the repo's **Pages** source is set to the `gh-pages` branch in GitHub → Settings → Pages.
