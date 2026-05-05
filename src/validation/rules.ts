import type { Node, Edge } from '@xyflow/react'
import type { NodeData, EdgeData, AppSettings } from '../graph/types'
import { getEdgeLength } from '../graph/utils'
import type { ValidationIssue } from './types'

export function validateGraph(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  settings: AppSettings
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (nodes.length === 0 && edges.length === 0) return issues

  // E-SCEN-001: exactly one source_gate
  const sourceGates = nodes.filter(n => n.data?.kind === 'source_gate')
  if (sourceGates.length !== 1) {
    issues.push({
      code: 'E-SCEN-001',
      severity: 'error',
      message: 'Rack scenario requires exactly one source_gate node.',
      nodeIds: sourceGates.map(n => n.id),
    })
  }

  // E-SCEN-002: exactly one outbound_gate (required)
  const outboundGates = nodes.filter(n => n.data?.kind === 'outbound_gate')
  if (outboundGates.length !== 1) {
    issues.push({
      code: 'E-SCEN-002',
      severity: 'error',
      message: `Rack scenario requires exactly one outbound_gate node (found ${outboundGates.length}).`,
      nodeIds: outboundGates.map(n => n.id),
    })
  }

  // E-RACK-001
  const rackAisles = nodes.filter(n => n.data?.kind === 'rack_aisle')
  if (rackAisles.length === 0) {
    issues.push({
      code: 'E-RACK-001',
      severity: 'error',
      message: 'Rack scenario requires at least one rack_aisle node.',
    })
  }

  // Collect unique aisle IDs from rack_aisle nodes
  const aisleIds = Array.from(new Set(
    rackAisles.map(n => n.data?.aisleId).filter((id): id is number => id != null)
  ))

  // Handover checks per aisle
  for (const aisleId of aisleIds) {
    const handovers = nodes.filter(n => n.data?.kind === 'handover' && n.data?.aisleId === aisleId)
    if (handovers.length === 0) {
      issues.push({
        code: 'E-HO-001',
        severity: 'error',
        message: `Aisle ${aisleId} is missing a handover node.`,
      })
    } else if (handovers.length > 1) {
      issues.push({
        code: 'E-HO-002',
        severity: 'error',
        message: `Aisle ${aisleId} has multiple handover nodes (expected exactly one).`,
        nodeIds: handovers.map(n => n.id),
      })
    }
  }

  // Edge field checks
  for (const edge of edges) {
    if (!edge.data) continue
    if (edge.data.lengthMode === 'manual' && edge.data.lengthMManual != null) {
      if (edge.data.lengthMManual <= 0) {
        issues.push({
          code: 'E-EDGE-001',
          severity: 'error',
          message: `Edge ${edge.id} length_m must be > 0.`,
          edgeIds: [edge.id],
        })
      }
    }
    if (edge.data.widthM <= 0) {
      issues.push({
        code: 'E-EDGE-002',
        severity: 'error',
        message: `Edge ${edge.id} width_m must be > 0.`,
        edgeIds: [edge.id],
      })
    }
    if (edge.data.intersections != null) {
      if (!Number.isInteger(edge.data.intersections) || edge.data.intersections < 0) {
        issues.push({
          code: 'E-EDGE-003',
          severity: 'error',
          message: `Edge ${edge.id} intersections must be a non-negative integer.`,
          edgeIds: [edge.id],
        })
      }
    }
  }

  // Rack aisle width banding
  const rackEdges = edges.filter(e => e.data?.preset === 'rack_aisle')
  const xnaEdges: Edge<EdgeData>[] = []
  const xqeEdges: Edge<EdgeData>[] = []

  for (const edge of rackEdges) {
    if (!edge.data) continue
    const w = edge.data.widthM
    if (w < 1.75) {
      issues.push({
        code: 'E-RACK-010',
        severity: 'error',
        message: `Rack aisle edge ${edge.id} width ${w}m is too narrow (< 1.75m).`,
        edgeIds: [edge.id],
      })
    } else if (w > 1.80 && w < 2.84) {
      issues.push({
        code: 'E-RACK-011',
        severity: 'error',
        message: `Rack aisle edge ${edge.id} width ${w}m is invalid (1.80m < width < 2.84m forbidden).`,
        edgeIds: [edge.id],
      })
    } else if (w >= 1.75 && w <= 1.80) {
      xnaEdges.push(edge)
    } else if (w >= 2.84) {
      xqeEdges.push(edge)
    }
  }

  if (xnaEdges.length > 0 && xqeEdges.length > 0) {
    issues.push({
      code: 'E-RACK-012',
      severity: 'error',
      message: 'Mixed rack mode: some rack aisles imply XNA (1.75\u20131.80m) and others imply XQE (\u2265 2.84m). Use only one rack mode site-wide.',
      edgeIds: [...xnaEdges.map(e => e.id), ...xqeEdges.map(e => e.id)],
    })
  }

  // Determine site rack mode
  const siteMode: 'XNA' | 'XQE' | null =
    xnaEdges.length > 0 && xqeEdges.length === 0 ? 'XNA' :
    xqeEdges.length > 0 && xnaEdges.length === 0 ? 'XQE' : null

  // Build adjacency for non-rack edges (for reachability checks)
  const nonRackEdges = edges.filter(e => e.data?.preset !== 'rack_aisle')

  function buildAdjacency(edgeList: Edge<EdgeData>[], includeWidthFilter?: number): Map<string, {neighbor: string, length: number, edgeId: string}[]> {
    const adj = new Map<string, {neighbor: string, length: number, edgeId: string}[]>()
    for (const edge of edgeList) {
      if (!edge.data) continue
      if (includeWidthFilter != null && edge.data.widthM < includeWidthFilter) continue
      const len = getEdgeLength(edge, nodes, settings.metersPerPixel)
      if (!adj.has(edge.source)) adj.set(edge.source, [])
      if (!adj.has(edge.target)) adj.set(edge.target, [])
      adj.get(edge.source)!.push({neighbor: edge.target, length: len, edgeId: edge.id})
      adj.get(edge.target)!.push({neighbor: edge.source, length: len, edgeId: edge.id})
    }
    return adj
  }

  function dijkstra(adj: Map<string, {neighbor: string, length: number, edgeId: string}[]>, start: string): Map<string, number> {
    const dist = new Map<string, number>()
    const visited = new Set<string>()
    dist.set(start, 0)
    const queue: [number, string][] = [[0, start]]
    while (queue.length > 0) {
      queue.sort((a, b) => a[0] - b[0])
      const [d, u] = queue.shift()!
      if (visited.has(u)) continue
      visited.add(u)
      for (const {neighbor, length} of adj.get(u) ?? []) {
        const nd = d + length
        if (!dist.has(neighbor) || nd < dist.get(neighbor)!) {
          dist.set(neighbor, nd)
          queue.push([nd, neighbor])
        }
      }
    }
    return dist
  }

  // E-HO-010: handover reachable from source_gate on non-rack edges
  if (sourceGates.length === 1) {
    const sg = sourceGates[0]
    const nonRackAdj = buildAdjacency(nonRackEdges)
    const distFromSG = dijkstra(nonRackAdj, sg.id)

    for (const aisleId of aisleIds) {
      const handovers = nodes.filter(n => n.data?.kind === 'handover' && n.data?.aisleId === aisleId)
      if (handovers.length !== 1) continue
      const ho = handovers[0]

      if (!distFromSG.has(ho.id)) {
        issues.push({
          code: 'E-HO-010',
          severity: 'error',
          message: `handover_${aisleId} must be reachable from source_gate using non-rack edges only (no rack_aisle edges).`,
          nodeIds: [ho.id],
        })
        continue
      }

      const distance = distFromSG.get(ho.id)!

      // Branching check
      if (distance <= 50) {
        // XQE path: need non-rack edges with width >= 2.84
        const xqeAdj = buildAdjacency(nonRackEdges, 2.84)
        const xqeDist = dijkstra(xqeAdj, sg.id)
        if (!xqeDist.has(ho.id)) {
          issues.push({
            code: 'E-BR-010',
            severity: 'error',
            message: `Aisle ${aisleId} (distance=${distance.toFixed(1)}m \u2264 50m): no feasible XQE path source_gate\u2192handover on non-rack edges (requires width \u2265 2.84m).`,
            nodeIds: [sg.id, ho.id],
          })
        }
      } else {
        // XPL path: need non-rack edges with width >= 2.60
        const xplAdj = buildAdjacency(nonRackEdges, 2.60)
        const xplDist = dijkstra(xplAdj, sg.id)
        if (!xplDist.has(ho.id)) {
          issues.push({
            code: 'E-BR-011',
            severity: 'error',
            message: `Aisle ${aisleId} (distance=${distance.toFixed(1)}m > 50m): no feasible XPL path source_gate\u2192handover on non-rack edges (requires width \u2265 2.60m).`,
            nodeIds: [sg.id, ho.id],
          })
        }
      }

      // Storage leg feasibility
      const aisleRackNodes = rackAisles.filter(n => n.data?.aisleId === aisleId)
      for (const rackNode of aisleRackNodes) {
        // Build adj for storage leg: non-rack edges + rack_aisle edges with matching aisleId
        const allowedEdges = edges.filter(e =>
          e.data?.preset !== 'rack_aisle' || e.data?.aisleId === aisleId
        )

        if (siteMode === 'XQE') {
          const stAdj = buildAdjacency(allowedEdges.filter(e => (e.data?.widthM ?? 0) >= 2.84), 2.84)
          const stDist = dijkstra(stAdj, ho.id)
          if (!stDist.has(rackNode.id)) {
            issues.push({
              code: 'E-ST-010',
              severity: 'error',
              message: `Aisle ${aisleId}: no feasible XQE path handover\u2192rack_aisle_${aisleId} (requires width \u2265 2.84m; rack_aisle edges from other aisles are not allowed).`,
              nodeIds: [ho.id, rackNode.id],
            })
          }
        } else if (siteMode === 'XNA') {
          // XNA: non-rack edges width >= 4.0, rack edges 1.75-1.80 with matching aisleId
          const xnaStorageEdges = allowedEdges.filter(e => {
            if (e.data?.preset === 'rack_aisle') {
              return e.data.aisleId === aisleId && e.data.widthM >= 1.75 && e.data.widthM <= 1.80
            }
            return (e.data?.widthM ?? 0) >= 4.0
          })
          const stAdj = buildAdjacency(xnaStorageEdges)
          const stDist = dijkstra(stAdj, ho.id)
          if (!stDist.has(rackNode.id)) {
            issues.push({
              code: 'E-ST-011',
              severity: 'error',
              message: `Aisle ${aisleId}: no feasible XNA path handover\u2192rack_aisle_${aisleId} (non-rack width \u2265 4.00m; rack_aisle width must be 1.75\u20131.80m; other-aisle rack edges not allowed).`,
              nodeIds: [ho.id, rackNode.id],
            })
          }
        }
      }
    }
  } else {
    // E-BR-001 for all aisles when no source gate
    for (const aisleId of aisleIds) {
      issues.push({
        code: 'E-BR-001',
        severity: 'error',
        message: `Aisle ${aisleId}: cannot compute distance source_gate\u2192handover (handover unreachable on non-rack network).`,
      })
    }
  }

  // Bulk storage reachability: must be reachable from source_gate on non-rack edges
  const bulkStorageNodes = nodes.filter(n => n.data?.kind === 'bulk_storage')
  if (sourceGates.length === 1 && bulkStorageNodes.length > 0) {
    const sg = sourceGates[0]
    const nonRackAdj = buildAdjacency(nonRackEdges)
    const distFromSG = dijkstra(nonRackAdj, sg.id)
    for (const bs of bulkStorageNodes) {
      if (!distFromSG.has(bs.id)) {
        issues.push({
          code: 'E-BULK-001',
          severity: 'error',
          message: `bulk_storage node ${bs.id} is not reachable from source_gate on non-rack edges.`,
          nodeIds: [bs.id],
        })
      }
    }
    // If outbound gate exists, bulk_storage must also reach outbound_gate
    if (outboundGates.length === 1) {
      const og = outboundGates[0]
      for (const bs of bulkStorageNodes) {
        if (!distFromSG.has(bs.id)) continue // already flagged above
        const distFromBS = dijkstra(nonRackAdj, bs.id)
        if (!distFromBS.has(og.id)) {
          issues.push({
            code: 'E-BULK-002',
            severity: 'error',
            message: `bulk_storage node ${bs.id} cannot reach outbound_gate on non-rack edges.`,
            nodeIds: [bs.id, og.id],
          })
        }
      }
    }
  }

  // W-RACK-001
  for (const edge of rackEdges) {
    if (!edge.data?.aisleId) continue
    const connectedNodes = nodes.filter(n => n.id === edge.source || n.id === edge.target)
    const mismatchedNodes = connectedNodes.filter(n => n.data?.aisleId != null && n.data.aisleId !== edge.data!.aisleId)
    if (mismatchedNodes.length > 0) {
      const nodeAisleIds = mismatchedNodes.map(n => n.data?.aisleId).join(', ')
      issues.push({
        code: 'W-RACK-001',
        severity: 'warning',
        message: `Rack aisle edge ${edge.id} has aisle_id ${edge.data.aisleId} but connects to node(s) with aisle_id ${nodeAisleIds}; check aisle tagging.`,
        edgeIds: [edge.id],
        nodeIds: mismatchedNodes.map(n => n.id),
      })
    }
  }

  return issues
}
