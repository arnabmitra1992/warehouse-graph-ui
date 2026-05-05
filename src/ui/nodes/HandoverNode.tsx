import { Handle, Position } from '@xyflow/react' 
import type { NodeProps, Node } from '@xyflow/react'
import type { NodeData } from '../../graph/types'

type HandoverNodeType = Node<NodeData, 'handover'>

export function HandoverNode({ data, selected }: NodeProps<HandoverNodeType>) {
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500 rounded-full' : ''}`}>
      <div className="w-14 h-14 rounded-full bg-blue-500 border-2 border-blue-700 flex flex-col items-center justify-center text-white">
        <span className="text-[10px] font-bold">HO</span>
        {data?.aisleId != null && <span className="text-[9px]">#{data.aisleId}</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-600" />
      <Handle type="target" position={Position.Left} className="!bg-blue-600" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-600" />
      <Handle type="target" position={Position.Top} className="!bg-blue-600" />
    </div>
  )
}
