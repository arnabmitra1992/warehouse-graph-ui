import { useRef } from 'react'
import { z } from 'zod'
import type { Node, Edge } from '@xyflow/react'
import { useStore } from '../store'
import type { NodeData, EdgeData, AppSettings } from '../graph/types'

const ImportSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  settings: z.object({
    metersPerPixel: z.number().positive(),
  }),
})

export function TopBar() {
  const { nodes, edges, settings, updateSettings, importGraph } = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const data = { nodes, edges, settings }
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
          parsed.settings as AppSettings
        )
      } catch (err) {
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    reader.readAsText(file)
    // Reset so the same file can be re-imported
    e.target.value = ''
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

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
