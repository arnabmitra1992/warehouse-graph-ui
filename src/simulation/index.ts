import { SimGraph, SimResult, AisleResult, PathResult } from './types'
import { dijkstra, reconstructPath, DijkstraEdge } from './dijkstra'

const SPEED_XQE = 2.0  // m/s
const SPEED_XNA = 1.5  // m/s

function buildAdj(
  edges: SimGraph['edges'],
  filter?: (e: SimGraph['edges'][0]) => boolean
): Map<string, DijkstraEdge[]> {
  const adj = new Map<string, DijkstraEdge[]>()
  for (const edge of edges) {
    if (filter && !filter(edge)) continue
    if (!adj.has(edge.source)) adj.set(edge.source, [])
    if (!adj.has(edge.target)) adj.set(edge.target, [])
    adj.get(edge.source)!.push({neighbor: edge.target, weight: edge.length, edgeId: edge.id})
    adj.get(edge.target)!.push({neighbor: edge.source, weight: edge.length, edgeId: edge.id})
  }
  return adj
}

export function runSimulation(graph: SimGraph): SimResult {
  const aisles: AisleResult[] = []

  const sourceGate = graph.nodes.find(n => n.kind === 'source_gate')
  if (!sourceGate) {
    return { aisles: [] }
  }

  // Determine site rack mode
  const rackEdges = graph.edges.filter(e => e.preset === 'rack_aisle')
  const xnaCount = rackEdges.filter(e => e.widthM >= 1.75 && e.widthM <= 1.80).length
  const xqeCount = rackEdges.filter(e => e.widthM >= 2.84).length
  const siteMode: 'XNA' | 'XQE' | null =
    xnaCount > 0 && xqeCount === 0 ? 'XNA' :
    xqeCount > 0 && xnaCount === 0 ? 'XQE' : null

  const speed = siteMode === 'XNA' ? SPEED_XNA : SPEED_XQE

  // Get unique aisle IDs
  const aisleIds = Array.from(new Set(
    graph.nodes.filter(n => n.kind === 'rack_aisle').map(n => n.aisleId).filter((id): id is number => id != null)
  ))

  // Non-rack adjacency for distance computation
  const nonRackAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle')
  const {dist: distFromSG} = dijkstra(nonRackAdj, sourceGate.id)

  for (const aisleId of aisleIds) {
    const handoverNode = graph.nodes.find(n => n.kind === 'handover' && n.aisleId === aisleId)
    const rackNodes = graph.nodes.filter(n => n.kind === 'rack_aisle' && n.aisleId === aisleId)

    if (!handoverNode || rackNodes.length === 0) {
      aisles.push({aisleId, distanceToHandover: 0, branch: 'unknown', error: 'Missing handover or rack_aisle node'})
      continue
    }

    const distanceToHandover = distFromSG.get(handoverNode.id)
    if (distanceToHandover == null) {
      aisles.push({aisleId, distanceToHandover: 0, branch: 'unknown', error: 'Handover unreachable from source_gate'})
      continue
    }

    const branch: 'XQE' | 'XPL' = distanceToHandover <= 50 ? 'XQE' : 'XPL'
    const minWidth = branch === 'XQE' ? 2.84 : 2.60

    // Handover path
    const handoverAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.widthM >= minWidth)
    const {dist: hoDist, prev: hoPrev} = dijkstra(handoverAdj, sourceGate.id)

    let handoverPath: PathResult | undefined
    if (hoDist.has(handoverNode.id)) {
      const p = reconstructPath(hoPrev, handoverNode.id)
      if (p) {
        handoverPath = {
          ...p,
          distanceM: hoDist.get(handoverNode.id)!,
          travelTimeS: hoDist.get(handoverNode.id)! / speed,
        }
      }
    }

    // Rack path (first rack node)
    const rackNode = rackNodes[0]
    let rackPath: PathResult | undefined

    if (siteMode === 'XQE') {
      const rackAdj = buildAdj(graph.edges, e => {
        if (e.preset === 'rack_aisle') return e.aisleId === aisleId && e.widthM >= 2.84
        return e.widthM >= 2.84
      })
      const {dist: rDist, prev: rPrev} = dijkstra(rackAdj, handoverNode.id)
      if (rDist.has(rackNode.id)) {
        const p = reconstructPath(rPrev, rackNode.id)
        if (p) {
          rackPath = {
            ...p,
            distanceM: rDist.get(rackNode.id)!,
            travelTimeS: rDist.get(rackNode.id)! / speed,
          }
        }
      }
    } else if (siteMode === 'XNA') {
      const rackAdj = buildAdj(graph.edges, e => {
        if (e.preset === 'rack_aisle') return e.aisleId === aisleId && e.widthM >= 1.75 && e.widthM <= 1.80
        return e.widthM >= 4.0
      })
      const {dist: rDist, prev: rPrev} = dijkstra(rackAdj, handoverNode.id)
      if (rDist.has(rackNode.id)) {
        const p = reconstructPath(rPrev, rackNode.id)
        if (p) {
          rackPath = {
            ...p,
            distanceM: rDist.get(rackNode.id)!,
            travelTimeS: rDist.get(rackNode.id)! / SPEED_XNA,
          }
        }
      }
    }

    aisles.push({
      aisleId,
      distanceToHandover,
      branch,
      handoverPath,
      rackPath,
    })
  }

  return { aisles }
}
