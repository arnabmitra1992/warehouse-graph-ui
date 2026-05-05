import { Handle, Position } from '@xyflow/react' 
import type { NodeProps, Node } from '@xyflow/react'
import type { NodeData } from '../../graph/types'

type SourceGateNodeType = Node<NodeData, 'source_gate'>

export function SourceGateNode({ data, selected }: NodeProps<SourceGateNodeType>) {
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <div
        className="w-12 h-12 bg-green-500 border-2 border-green-700 flex items-center justify-center text-white text-xs font-bold"
        style={{ transform: 'rotate(45deg)', width: 48, height: 48 }}
      >
        <span style={{ transform: 'rotate(-45deg)' }} className="text-[10px]">
          {data?.label || 'SG'}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-green-600" />
      <Handle type="target" position={Position.Left} className="!bg-green-600" />
      <Handle type="source" position={Position.Bottom} className="!bg-green-600" />
      <Handle type="target" position={Position.Top} className="!bg-green-600" />
    </div>
  )
}
