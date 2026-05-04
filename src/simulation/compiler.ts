import { Node, Edge } from '@xyflow/react'
import { NodeData, EdgeData, AppSettings } from '../graph/types'
import { getEdgeLength } from '../graph/utils'
import { SimGraph } from './types'

export function compileGraph(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  settings: AppSettings
): SimGraph {
  return {
    nodes: nodes.map(n => ({
      id: n.id,
      kind: n.data?.kind ?? 'turn',
      aisleId: n.data?.aisleId,
    })),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      length: getEdgeLength(e, nodes, settings.metersPerPixel),
      widthM: e.data?.widthM ?? 0,
      preset: e.data?.preset ?? 'connector',
      aisleId: e.data?.aisleId,
    })),
  }
}
