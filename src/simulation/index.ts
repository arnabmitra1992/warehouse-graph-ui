import type { SimGraph, SimResult, AisleResult, PathResult } from './types'
import { dijkstra, reconstructPath } from './dijkstra'
import type { DijkstraEdge } from './dijkstra'

// AGV speeds in m/s
const SPEED_XQE = 2.0  // XQE (short-distance ≤50m compact electric)
const SPEED_XPL = 1.6  // XPL (long-distance >50m pallet jack)
const SPEED_XNA = 1.5  // XNA (narrow-aisle)

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

  // Optional outbound gate
  const outboundGate = graph.nodes.find(n => n.kind === 'outbound_gate')

  // Determine site rack mode
  const rackEdges = graph.edges.filter(e => e.preset === 'rack_aisle')
  const xnaCount = rackEdges.filter(e => e.widthM >= 1.75 && e.widthM <= 1.80).length
  const xqeCount = rackEdges.filter(e => e.widthM >= 2.84).length
  const siteMode: 'XNA' | 'XQE' | null =
    xnaCount > 0 && xqeCount === 0 ? 'XNA' :
    xqeCount > 0 && xnaCount === 0 ? 'XQE' : null

  // Get unique aisle IDs from rack_aisle nodes
  const aisleIds = Array.from(new Set(
    graph.nodes.filter(n => n.kind === 'rack_aisle').map(n => n.aisleId).filter((id): id is number => id != null)
  ))

  // Non-rack adjacency (ignoring width) for branch-distance computation
  const nonRackAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle')
  const {dist: distFromSG} = dijkstra(nonRackAdj, sourceGate.id)

  for (const aisleId of aisleIds) {
    const handoverNode = graph.nodes.find(n => n.kind === 'handover' && n.aisleId === aisleId)
    const rackNodes = graph.nodes.filter(n => n.kind === 'rack_aisle' && n.aisleId === aisleId)

    if (!handoverNode || rackNodes.length === 0) {
      aisles.push({aisleId, distanceToHandover: 0, branch: 'unknown', error: 'Missing handover or rack_aisle node'})
      continue
    }

    // Branch distance: non-rack edges only, ignoring width constraints
    const distanceToHandover = distFromSG.get(handoverNode.id)
    if (distanceToHandover == null) {
      aisles.push({aisleId, distanceToHandover: 0, branch: 'unknown', error: 'Handover unreachable from source_gate'})
      continue
    }

    // Pick branch and speeds based on distance
    // ≤50m: XQE vehicle; >50m: XPL vehicle
    const branch: 'XQE' | 'XPL' = distanceToHandover <= 50 ? 'XQE' : 'XPL'
    const inboundSpeed = branch === 'XQE' ? SPEED_XQE : SPEED_XPL
    const minWidthInbound = branch === 'XQE' ? 2.84 : 2.60

    // Inbound path: source_gate → handover (non-rack edges, width-constrained)
    const handoverAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.widthM >= minWidthInbound)
    const {dist: hoDist, prev: hoPrev} = dijkstra(handoverAdj, sourceGate.id)

    let handoverPath: PathResult | undefined
    if (hoDist.has(handoverNode.id)) {
      const p = reconstructPath(hoPrev, handoverNode.id)
      if (p) {
        handoverPath = {
          ...p,
          distanceM: hoDist.get(handoverNode.id)!,
          travelTimeS: hoDist.get(handoverNode.id)! / inboundSpeed,
        }
      }
    }

    // Storage path: handover → rack_aisle (rack edges allowed only for this aisle)
    const rackNode = rackNodes[0]
    let rackPath: PathResult | undefined

    if (siteMode === 'XQE') {
      // XQE vehicle enters rack: non-rack width ≥2.84, rack edges for this aisle only width ≥2.84
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
            travelTimeS: rDist.get(rackNode.id)! / SPEED_XQE,
          }
        }
      }
    } else if (siteMode === 'XNA') {
      // XNA vehicle enters rack: non-rack width ≥4.0, rack edges for this aisle width 1.75–1.80
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

    // Outbound path: handover → outbound_gate (non-rack edges, same vehicle as inbound leg)
    let outboundPath: PathResult | undefined
    if (outboundGate) {
      const outboundAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.widthM >= minWidthInbound)
      const {dist: obDist, prev: obPrev} = dijkstra(outboundAdj, handoverNode.id)
      if (obDist.has(outboundGate.id)) {
        const p = reconstructPath(obPrev, outboundGate.id)
        if (p) {
          outboundPath = {
            ...p,
            distanceM: obDist.get(outboundGate.id)!,
            travelTimeS: obDist.get(outboundGate.id)! / inboundSpeed,
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
      outboundPath,
    })
  }

  return { aisles }
}
