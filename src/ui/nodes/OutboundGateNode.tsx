import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { NodeData } from '../../graph/types'

type OutboundGateNodeType = Node<NodeData, 'outbound_gate'>

export function OutboundGateNode({ data, selected }: NodeProps<OutboundGateNodeType>) {
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <div
        className="w-12 h-12 bg-red-500 border-2 border-red-700 flex items-center justify-center text-white text-xs font-bold"
        style={{ transform: 'rotate(45deg)', width: 48, height: 48 }}
      >
        <span style={{ transform: 'rotate(-45deg)' }} className="text-[10px]">
          {data?.label || 'OG'}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-red-600" />
      <Handle type="target" position={Position.Left} className="!bg-red-600" />
      <Handle type="source" position={Position.Bottom} className="!bg-red-600" />
      <Handle type="target" position={Position.Top} className="!bg-red-600" />
    </div>
  )
}
