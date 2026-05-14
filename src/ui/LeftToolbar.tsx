import React from 'react'

const nodeTypes = [
  { kind: 'source_gate', label: 'Source Gate', color: 'bg-green-500' },
  { kind: 'outbound_gate', label: 'Outbound Gate', color: 'bg-red-500' },
  { kind: 'handover', label: 'Handover', color: 'bg-blue-500' },
  { kind: 'rack_aisle', label: 'Rack Aisle', color: 'bg-orange-400' },
  { kind: 'ground_storage', label: 'Ground Storage', color: 'bg-emerald-500' },
  { kind: 'turn', label: 'Turn', color: 'bg-gray-400' },
] as const

export function LeftToolbar() {
  const onDragStart = (event: React.DragEvent, kind: string) => {
    event.dataTransfer.setData('application/reactflow', kind)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-[200px] bg-gray-800 text-white p-3 flex flex-col gap-3 border-r border-gray-700">
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Nodes</h2>
      {nodeTypes.map(({ kind, label, color }) => (
        <div
          key={kind}
          draggable
          onDragStart={(e) => onDragStart(e, kind)}
          className={`${color} text-white text-sm font-medium px-3 py-2 rounded cursor-grab active:cursor-grabbing select-none shadow hover:opacity-90 transition-opacity`}
        >
          {label}
        </div>
      ))}
      <div className="mt-4 text-xs text-gray-400 border-t border-gray-600 pt-3">
        Drag nodes onto the canvas. Connect nodes by dragging from a handle to another node.
      </div>
    </div>
  )
}
