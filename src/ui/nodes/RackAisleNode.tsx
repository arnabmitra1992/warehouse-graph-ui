import { Handle, Position } from '@xyflow/react' 
import type { NodeProps, Node } from '@xyflow/react'
import type { NodeData } from '../../graph/types'

type RackAisleNodeType = Node<NodeData, 'rack_aisle'>

export function RackAisleNode({ data, selected }: NodeProps<RackAisleNodeType>) {
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500 rounded' : ''}`}>
      <div className="w-16 h-10 rounded bg-orange-400 border-2 border-orange-600 flex flex-col items-center justify-center text-white">
        <span className="text-[10px] font-bold">RACK</span>
        {data?.aisleId != null && <span className="text-[9px]">#{data.aisleId}</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-orange-500" />
      <Handle type="target" position={Position.Left} className="!bg-orange-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500" />
      <Handle type="target" position={Position.Top} className="!bg-orange-500" />
    </div>
  )
}
