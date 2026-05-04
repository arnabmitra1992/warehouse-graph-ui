import { Node, Edge } from '@xyflow/react'
import { NodeData, EdgeData } from './types'

export function getEdgeLength(
  edge: Edge<EdgeData>,
  nodes: Node<NodeData>[],
  metersPerPixel: number
): number {
  if (edge.data?.lengthMode === 'manual' && edge.data.lengthMManual != null) {
    return edge.data.lengthMManual
  }
  const source = nodes.find(n => n.id === edge.source)
  const target = nodes.find(n => n.id === edge.target)
  if (!source || !target) return 0
  const sx = (source.position.x + (source.measured?.width ?? 60) / 2)
  const sy = (source.position.y + (source.measured?.height ?? 60) / 2)
  const tx = (target.position.x + (target.measured?.width ?? 60) / 2)
  const ty = (target.position.y + (target.measured?.height ?? 60) / 2)
  const dx = tx - sx
  const dy = ty - sy
  return Math.sqrt(dx * dx + dy * dy) * metersPerPixel
}
