import { useRef } from 'react'
import { z } from 'zod'
import type { Node, Edge } from '@xyflow/react'
import { useStore } from '../store'
import type { NodeData, EdgeData, AppSettings, LayoutUnderlay } from '../graph/types'
import { compileGraph } from '../simulation/compiler'
import { compileSimulatorConfig } from '../integration/simulatorConfig'

const ImportSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  underlay: z.object({
    name: z.string(),
    mimeType: z.string(),
    dataUrl: z.string(),
    opacity: z.number().min(0).max(1),
  }).nullable().optional(),
  settings: z.object({
    metersPerPixel: z.number().positive(),
    simulator: z.object({
      storageTypesInUse: z.array(z.enum(['rack', 'ground_storage', 'ground_stacking'])).min(1),
      randomSeed: z.number().int().optional(),
      inboundDailyPallets: z.number().int().min(0).optional(),
      outboundDailyPallets: z.number().int().min(0).optional(),
      totalDailyPallets: z.number().int().positive().optional(),
      operatingHours: z.number().positive(),
      utilizationTarget: z.number().positive(),
      rackDailyPallets: z.number().int().min(0),
      stackingDailyPallets: z.number().int().min(0),
      rackLevels: z.number().int().positive(),
      shelfHeightSpacingMm: z.number().positive(),
      positionSpacingMm: z.number().positive(),
      stackingRows: z.number().int().positive(),
      stackingColumns: z.number().int().positive(),
      stackingLevels: z.number().int().positive(),
      blockStoragePolicy: z.enum(['fifo', 'lane_sequence', 'column_fifo']),
      trafficControlEnabled: z.boolean(),
      intersectionCount: z.number().int().min(0),
      intersectionCycleTimeS: z.number().positive(),
    }).optional(),
  }),
})

const PROJECT_STORAGE_KEY = 'warehouse_graph_projects_v1'

interface SavedProject {
  name: string
  savedAt: string
  nodes: Node<NodeData>[]
  edges: Edge<EdgeData>[]
  settings: AppSettings
  underlay: LayoutUnderlay | null
}

export function TopBar() {
  const { nodes, edges, settings, underlay, setUnderlay, updateSettings, importGraph } = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const underlayInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const data = { nodes, edges, settings, underlay }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'warehouse-graph.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleUnderlayImport = () => {
    underlayInputRef.current?.click()
  }

  const handleExportSimulatorConfig = () => {
    const graph = compileGraph(nodes, edges, settings)
    const config = compileSimulatorConfig(graph, settings)
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'simulator-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        const parsed = ImportSchema.parse(json)
        importGraph(
          parsed.nodes as Node<NodeData>[],
          parsed.edges as Edge<EdgeData>[],
          ({
            metersPerPixel: parsed.settings.metersPerPixel,
            simulator: parsed.settings.simulator ? {
              ...parsed.settings.simulator,
              randomSeed: parsed.settings.simulator.randomSeed ?? 42,
              inboundDailyPallets:
                parsed.settings.simulator.inboundDailyPallets
                ?? Math.round((parsed.settings.simulator.totalDailyPallets ?? 1000) / 2),
              outboundDailyPallets:
                parsed.settings.simulator.outboundDailyPallets
                ?? Math.round((parsed.settings.simulator.totalDailyPallets ?? 1000) / 2),
            } : {
              inboundDailyPallets: 500,
              outboundDailyPallets: 500,
              storageTypesInUse: ['rack'],
              randomSeed: 42,
              operatingHours: 16,
              utilizationTarget: 0.75,
              rackDailyPallets: 500,
              stackingDailyPallets: 200,
              rackLevels: 3,
              shelfHeightSpacingMm: 1300,
              positionSpacingMm: 950,
              stackingRows: 10,
              stackingColumns: 12,
              stackingLevels: 3,
              blockStoragePolicy: 'lane_sequence',
              trafficControlEnabled: false,
              intersectionCount: 0,
              intersectionCycleTimeS: 30,
            },
          }) as AppSettings,
          parsed.underlay ?? null
        )
      } catch (err) {
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    reader.readAsText(file)
    // Reset so the same file can be re-imported
    e.target.value = ''
  }

  const handleUnderlayFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      alert('Only JPG, PNG, or PDF files are supported for underlay.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setUnderlay({
        name: file.name,
        mimeType: file.type,
        dataUrl,
        opacity: 0.45,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSaveProject = () => {
    const name = window.prompt('Project name')
    if (!name?.trim()) return
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
    const projects = raw ? (JSON.parse(raw) as SavedProject[]) : []
    const next = projects.filter((p) => p.name !== name.trim())
    next.push({
      name: name.trim(),
      savedAt: new Date().toISOString(),
      nodes,
      edges,
      settings,
      underlay,
    })
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next))
    alert(`Project "${name.trim()}" saved.`)
  }

  const handleLoadProject = () => {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
    const projects = raw ? (JSON.parse(raw) as SavedProject[]) : []
    if (projects.length === 0) {
      alert('No saved projects found.')
      return
    }
    const sorted = [...projects].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    const labels = sorted.map((p, i) => `${i + 1}. ${p.name} (${new Date(p.savedAt).toLocaleString()})`).join('\n')
    const pick = window.prompt(`Choose project number:\n${labels}`)
    const idx = pick ? Number.parseInt(pick, 10) - 1 : -1
    if (!Number.isInteger(idx) || idx < 0 || idx >= sorted.length) return
    const selected = sorted[idx]
    importGraph(selected.nodes, selected.edges, selected.settings, selected.underlay ?? null)
  }

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4 shrink-0">
      <span className="text-sm font-bold text-white tracking-wide">🏭 Warehouse Graph</span>

      <div className="flex items-center gap-2 ml-auto">
        <label className="text-xs text-gray-400">m/px:</label>
        <input
          type="number"
          step={0.001}
          min={0.001}
          value={settings.metersPerPixel}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (v > 0) updateSettings({ metersPerPixel: v })
          }}
          className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-blue-400"
        />

        <button
          onClick={handleImport}
          className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded border border-gray-600 transition-colors"
        >
          ↑ Import
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded border border-gray-600 transition-colors"
        >
          ↓ Export
        </button>
        <button
          onClick={handleSaveProject}
          className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded border border-gray-600 transition-colors"
          title="Save project to browser local storage"
        >
          Save Project
        </button>
        <button
          onClick={handleLoadProject}
          className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded border border-gray-600 transition-colors"
          title="Load project from browser local storage"
        >
          Load Project
        </button>
        <button
          onClick={handleUnderlayImport}
          className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded border border-gray-600 transition-colors"
          title="Import a JPG/PNG/PDF underlay"
        >
          Underlay
        </button>
        {underlay && (
          <>
            <label className="text-xs text-gray-400">Opacity</label>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={underlay.opacity}
              onChange={(e) => setUnderlay({ ...underlay, opacity: Number.parseFloat(e.target.value) })}
            />
            <button
              onClick={() => setUnderlay(null)}
              className="px-2 py-1 text-xs font-medium bg-red-700 hover:bg-red-600 text-white rounded border border-red-600 transition-colors"
              title="Remove layout underlay"
            >
              Clear
            </button>
          </>
        )}
        <button
          onClick={handleExportSimulatorConfig}
          className="px-3 py-1 text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white rounded border border-blue-600 transition-colors"
          title="Export simulator-ready JSON config"
        >
          ↓ Simulator JSON
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={underlayInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={handleUnderlayFileChange}
        />
      </div>
    </div>
  )
}
