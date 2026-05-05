# warehouse-graph-ui

A standalone **Vite + React + TypeScript** application for drawing and simulating a warehouse graph using [React Flow](https://reactflow.dev/).

## Features

- **Interactive graph editor** – drag-and-drop node types onto a canvas, connect them with edges
- **Node types**: `source_gate`, `outbound_gate`, `handover`, `rack_aisle`, `bulk_storage`, `turn`
- **Edge types** with configurable width, length (auto from positions or manual), preset (`rack_aisle`, `head_aisle`, `corridor`, `connector`), priority stream, and intersection count
- **Rack properties** – configure `rackLengthM`, `rackHeightM`, `levels`, `bays`, and `depth` per `rack_aisle` node
- **Bulk storage** – `bulk_storage` nodes with optional `capacityM3` and `areaM2` properties
- **Always-on validation** – checks rack mode consistency (XNA / XQE), scenario rules (one source_gate, one outbound_gate), branching distances, feasibility of handover paths, storage-leg paths, and bulk storage reachability
- **Simulation** – Dijkstra-based routing computes shortest feasible paths and travel times for three legs per aisle: **inbound** (source_gate→handover), **storage** (handover→rack_aisle), **outbound** (handover→outbound_gate), with result highlighting on the canvas
- **Import / Export JSON** – preserves full graph and settings (including rack properties); validated on import with Zod
- **GitHub Pages deployment** ready

## Node Types

| Kind | Description | Required count |
|------|-------------|---------------|
| `source_gate` | Inbound goods entry point | Exactly 1 |
| `outbound_gate` | Outbound goods exit point | Exactly 1 |
| `handover` | AGV handover point per aisle (set `aisleId`) | One per aisle |
| `rack_aisle` | Rack storage aisle (set `aisleId`, and optionally rack properties) | ≥1 per aisle |
| `bulk_storage` | Floor-level bulk/block storage area | 0+ |
| `turn` | Path junction / turn node | 0+ |

## Simulation Legs

For each aisle the simulation computes:

1. **Inbound** (`source_gate → handover`) – uses non-rack edges only; vehicle is XQE (speed 2.0 m/s) if branch distance ≤50 m, or XPL (speed 1.6 m/s) if >50 m; edge width ≥2.84 m (XQE) or ≥2.60 m (XPL).
2. **Storage** (`handover → rack_aisle`) – rack edges restricted to the current aisle; vehicle speed matches site rack mode: XQE (2.0 m/s) or XNA (1.5 m/s).
3. **Outbound** (`handover → outbound_gate`) – same vehicle/speed as inbound leg; non-rack edges only; same width constraints.

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
