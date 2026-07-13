import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { NodeData } from '../../graph/types'

type GroundStorageNodeType = Node<NodeData, 'ground_storage'>

export function GroundStorageNode({ data, selected }: NodeProps<GroundStorageNodeType>) {
  const rows = Math.max(1, data?.blockRows ?? 1)
  const cols = Math.max(1, data?.blockColumns ?? 1)
  const levels = Math.max(1, data?.blockLevels ?? 1)
  const mode = data?.storageType === 'ground_stacking' ? 'STACK' : 'STORE'
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500 rounded' : ''}`}>
      <div className="node-drag-handle cursor-move min-w-[84px] h-[58px] rounded bg-emerald-500 border-2 border-emerald-700 flex flex-col items-center justify-center text-white px-2">
        <span className="text-[9px] font-bold tracking-wide">GROUND</span>
        <span className="text-[10px] font-semibold">{mode}</span>
        <span className="text-[9px] opacity-90">{rows}×{cols}×{levels}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-600" />
      <Handle type="target" position={Position.Left} className="!bg-emerald-600" />
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-600" />
      <Handle type="target" position={Position.Top} className="!bg-emerald-600" />
    </div>
  )
}
