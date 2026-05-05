import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { NodeData } from '../../graph/types'

type BulkStorageNodeType = Node<NodeData, 'bulk_storage'>

export function BulkStorageNode({ data, selected }: NodeProps<BulkStorageNodeType>) {
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500 rounded' : ''}`}>
      <div className="w-20 h-12 rounded bg-purple-500 border-2 border-purple-700 flex flex-col items-center justify-center text-white">
        <span className="text-[10px] font-bold">BULK</span>
        {data?.label && <span className="text-[9px] truncate max-w-[72px]">{data.label}</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-purple-600" />
      <Handle type="target" position={Position.Left} className="!bg-purple-600" />
      <Handle type="source" position={Position.Bottom} className="!bg-purple-600" />
      <Handle type="target" position={Position.Top} className="!bg-purple-600" />
    </div>
  )
}
