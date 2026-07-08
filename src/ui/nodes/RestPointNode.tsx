import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { NodeData } from '../../graph/types'

type RestPointNodeType = Node<NodeData, 'rest_point'>

export function RestPointNode({ data, selected }: NodeProps<RestPointNodeType>) {
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500 rounded' : ''}`}>
      <div className="node-drag-handle cursor-move min-w-[52px] h-10 rounded bg-amber-500 border-2 border-amber-700 flex items-center justify-center text-white px-2">
        <span className="text-[10px] font-bold">{data?.label || 'REST'}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-amber-600" />
      <Handle type="target" position={Position.Left} className="!bg-amber-600" />
      <Handle type="source" position={Position.Bottom} className="!bg-amber-600" />
      <Handle type="target" position={Position.Top} className="!bg-amber-600" />
    </div>
  )
}
