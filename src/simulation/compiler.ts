import type { Node, Edge } from '@xyflow/react'
import type { NodeData, EdgeData, AppSettings } from '../graph/types'
import { getEdgeLength } from '../graph/utils'
import type { SimGraph } from './types'

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
      storageType: n.data?.storageType,
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
