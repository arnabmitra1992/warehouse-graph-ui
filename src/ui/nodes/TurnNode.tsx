import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { NodeData } from '../../graph/types'

type TurnNodeType = Node<NodeData, 'turn'>

export function TurnNode({ data, selected }: NodeProps<TurnNodeType>) {
  return (
    <div className={`relative flex items-center justify-center ${selected ? 'ring-2 ring-blue-500 rounded' : ''}`}>
      <div className="w-8 h-8 rounded bg-gray-400 border-2 border-gray-600 flex items-center justify-center text-white">
        <span className="text-[8px] font-bold">{data?.label || 'T'}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-500" />
      <Handle type="target" position={Position.Left} className="!bg-gray-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500" />
      <Handle type="target" position={Position.Top} className="!bg-gray-500" />
    </div>
  )
}
