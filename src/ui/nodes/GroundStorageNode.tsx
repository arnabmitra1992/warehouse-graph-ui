import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { NodeData } from '../../graph/types'

type GroundStorageNodeType = Node<NodeData, 'ground_storage'>

export function GroundStorageNode({ data, selected }: NodeProps<GroundStorageNodeType>) {
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500 rounded' : ''}`}>
      <div className="w-16 h-10 rounded bg-emerald-500 border-2 border-emerald-700 flex flex-col items-center justify-center text-white">
        <span className="text-[9px] font-bold">GROUND</span>
        <span className="text-[9px]">{data?.storageType === 'ground_stacking' ? 'STACK' : 'STORE'}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-600" />
      <Handle type="target" position={Position.Left} className="!bg-emerald-600" />
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-600" />
      <Handle type="target" position={Position.Top} className="!bg-emerald-600" />
    </div>
  )
}
