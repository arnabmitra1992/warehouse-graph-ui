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

  // E-SCEN-001
  const sourceGates = nodes.filter(n => n.data?.kind === 'source_gate')
  if (sourceGates.length === 0) {
    issues.push({
      code: 'E-SCEN-001',
      severity: 'error',
      message: 'Rack scenario requires at least one source_gate node.',
    })
  } else if (sourceGates.length > 1) {
    issues.push({
      code: 'W-SCEN-001',
      severity: 'warning',
      message: 'Multiple source_gate nodes found. The nearest reachable source gate is used per aisle for inbound checks.',
      nodeIds: sourceGates.map(n => n.id),
    })
  }

  const restPoints = nodes.filter(n => n.data?.kind === 'rest_point')
  if (restPoints.length > 1) {
    issues.push({
      code: 'W-REST-001',
      severity: 'warning',
      message: 'More than one rest_point node found. The simulator currently uses the first one only.',
      nodeIds: restPoints.map((n) => n.id),
    })
  }

  const storageTypes = settings.simulator.storageTypesInUse
  const useRack = storageTypes.includes('rack')
  const useGround = storageTypes.includes('ground_storage') || storageTypes.includes('ground_stacking')
  const forceExplicitHandover = !!settings.simulator.forceExplicitHandover

  // E-RACK-001
  const rackAisles = nodes.filter(n => n.data?.kind === 'rack_aisle')
  if (useRack && rackAisles.length === 0) {
    issues.push({
      code: 'E-RACK-001',
      severity: 'error',
      message: 'Storage type is rack, but no rack_aisle node exists.',
    })
  }

  const groundNodes = nodes.filter(n => n.data?.kind === 'ground_storage')
  if (useGround && groundNodes.length === 0) {
    issues.push({
      code: 'E-GS-001',
      severity: 'error',
      message: 'Ground storage/stacking mode selected, but no ground_storage node exists.',
    })
  }

  const outboundGates = nodes.filter(n => n.data?.kind === 'outbound_gate')
  if (outboundGates.length === 0) {
    issues.push({
      code: 'W-FLOW-001',
      severity: 'warning',
      message: 'No outbound_gate node found. Add one to model outbound material flow explicitly.',
    })
  }

  // Collect unique aisle IDs from rack_aisle nodes
  const aisleIds = Array.from(new Set([
    ...rackAisles.map(n => n.data?.aisleId).filter((id): id is number => id != null),
    ...edges
      .filter((e) => (e.data?.preset === 'rack_aisle' || e.data?.preset === 'storage_aisle') && e.data?.aisleId != null)
      .map((e) => e.data!.aisleId as number),
  ]))

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
    if (!edge.data.priorityStream) {
      issues.push({
        code: (edge.data.preset === 'rack_aisle' || edge.data.preset === 'storage_aisle') ? 'W-PRI-RA-001' : 'W-PRI-NR-001',
        severity: 'warning',
        message:
          (edge.data.preset === 'rack_aisle' || edge.data.preset === 'storage_aisle')
            ? `Storage aisle edge ${edge.id} has no priority stream. Set inbound/outbound/shared.`
            : `Non-aisle edge ${edge.id} has no priority stream. Set inbound/outbound/shared.`,
        edgeIds: [edge.id],
      })
    }
    if ((edge.data.preset === 'head_aisle' || edge.data.preset === 'rack_aisle' || edge.data.preset === 'storage_aisle') && !edge.data.aisleId) {
      issues.push({
        code: 'W-AISLE-ID-001',
        severity: 'warning',
        message: `Aisle-class edge ${edge.id} has no aisle_id; set aisle_id to group edges that belong to the same aisle.`,
        edgeIds: [edge.id],
      })
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
  const nonRackEdges = edges.filter(e => e.data?.preset !== 'rack_aisle' && e.data?.preset !== 'storage_aisle')

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
  if (sourceGates.length > 0) {
    const nonRackAdj = buildAdjacency(nonRackEdges)
    const allAdj = buildAdjacency(edges)
    const distFromAnySGMaps = sourceGates.map((sg) => dijkstra(nonRackAdj, sg.id))
    const distAllFromAnySGMaps = sourceGates.map((sg) => dijkstra(allAdj, sg.id))
    const minDistance = (maps: Map<string, number>[], nodeId: string): number | undefined => {
      let best = Number.POSITIVE_INFINITY
      for (const dist of maps) {
        const d = dist.get(nodeId)
        if (d != null && d < best) best = d
      }
      return Number.isFinite(best) ? best : undefined
    }

    if (useGround) {
      const groundStorageNodes = nodes.filter(n => n.data?.kind === 'ground_storage')
      const minGroundDist = Math.min(
        ...groundStorageNodes.map((n) => minDistance(distAllFromAnySGMaps, n.id) ?? Number.POSITIVE_INFINITY)
      )
      if (Number.isFinite(minGroundDist) && minGroundDist >= 50) {
        const hasAnyHandover = nodes.some(n => n.data?.kind === 'handover')
        if (!hasAnyHandover) {
          issues.push({
            code: 'E-HO-GS-001',
            severity: 'error',
            message: `Ground storage path is ${minGroundDist.toFixed(1)}m (>=50m): add handover for XPL horizontal transport.`,
          })
        }
      }
    }

    const allHandovers = nodes.filter(n => n.data?.kind === 'handover')
    for (const aisleId of aisleIds) {
      const storageEdgeNodeIds = new Set(
        edges
          .filter((e) => (e.data?.preset === 'rack_aisle' || e.data?.preset === 'storage_aisle') && e.data?.aisleId === aisleId)
          .flatMap((e) => [e.source, e.target])
      )
      const aisleStorageNodes = nodes.filter((n) =>
        (n.data?.kind === 'rack_aisle' && n.data?.aisleId === aisleId) ||
        (n.data?.kind === 'ground_storage' && storageEdgeNodeIds.has(n.id))
      )
      if (aisleStorageNodes.length === 0) {
        issues.push({
          code: 'W-AISLE-EMPTY-001',
          severity: 'warning',
          message: `Aisle ${aisleId}: no storage node is connected/tagged for this aisle_id.`,
        })
        continue
      }
      const sourceToRackDist = aisleStorageNodes
        .map((n) => minDistance(distAllFromAnySGMaps, n.id))
        .filter((d): d is number => d != null)
        .reduce((min, d) => Math.min(min, d), Number.POSITIVE_INFINITY)
      const aisleTaggedHandovers = allHandovers.filter((h) => h.data?.aisleId === aisleId)
      const explicitHandoverRequested =
        forceExplicitHandover &&
        aisleTaggedHandovers.length > 0
      const needsHandover = explicitHandoverRequested || (sourceToRackDist ?? 0) >= 50

      if (needsHandover && allHandovers.length === 0) {
        const distLabel = Number.isFinite(sourceToRackDist) ? sourceToRackDist.toFixed(1) : 'n/a'
        issues.push({
          code: 'E-HO-001',
          severity: 'error',
          message: `Aisle ${aisleId}: handover required by 50m rule (source->storage ${distLabel}m).`,
        })
        continue
      }
      if (allHandovers.length === 0) {
        // No handover is valid under 50m: direct XQE/XNA storage leg checks still apply.
        continue
      }
      const aisleTagged = aisleTaggedHandovers
      const shared = allHandovers.filter((h) => h.data?.aisleId == null)
      const preferred = aisleTagged.length > 0 ? aisleTagged : shared
      const candidates = preferred.length > 0 ? preferred : allHandovers
      const candidate = candidates
        .map((h) => ({ h, d: minDistance(distFromAnySGMaps, h.id) }))
        .filter((x): x is { h: (typeof candidates)[number]; d: number } => x.d != null)
        .sort((a, b) => a.d - b.d)[0]
      if (!candidate) {
        issues.push({
          code: 'E-HO-010',
          severity: 'error',
          message: `Aisle ${aisleId}: no reachable handover from source_gate on non-storage network.`,
        })
        continue
      }
      const ho = candidate.h

      if (minDistance(distFromAnySGMaps, ho.id) == null) {
        issues.push({
          code: 'E-HO-010',
          severity: 'error',
          message: `handover_${aisleId} must be reachable from source_gate using the non-storage network only (no rack_aisle or storage_aisle edges).`,
          nodeIds: [ho.id],
        })
        continue
      }

      // Branching check
      if (needsHandover) {
        // If handover is required by source->storage distance, SG->HO must be XPL-capable.
        const xplAdj = buildAdjacency(nonRackEdges, 2.60)
        const xplDistMaps = sourceGates.map((sg) => dijkstra(xplAdj, sg.id))
        if (minDistance(xplDistMaps, ho.id) == null) {
          issues.push({
            code: 'E-BR-011',
            severity: 'error',
            message: `Aisle ${aisleId}: handover required by 50m rule but no feasible XPL path source_gate\u2192handover (requires width \u2265 2.60m).`,
            nodeIds: [ho.id],
          })
        }
      }

      // Storage leg feasibility
      for (const rackNode of aisleStorageNodes) {
        // Build adj for storage leg: non-storage travel network plus same-aisle storage edges.
        const allowedEdges = edges.filter(e =>
          (e.data?.preset !== 'rack_aisle' && e.data?.preset !== 'storage_aisle') || e.data?.aisleId === aisleId
        )

        if (siteMode === 'XQE') {
          const stAdj = buildAdjacency(allowedEdges.filter(e => (e.data?.widthM ?? 0) >= 2.84), 2.84)
          const stDist = dijkstra(stAdj, ho.id)
          if (!stDist.has(rackNode.id)) {
            issues.push({
              code: 'E-ST-010',
              severity: 'error',
              message: `Aisle ${aisleId}: no feasible XQE storage path handover\u2192aisle_${aisleId} (requires width \u2265 2.84m; only same-aisle rack_aisle/storage_aisle edges may be used on the storage leg).`,
              nodeIds: [ho.id, rackNode.id],
            })
          }
        } else if (siteMode === 'XNA') {
          // XNA: non-storage travel edges width >= 4.0, and only same-aisle rack_aisle edges may be 1.75-1.80.
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
              message: `Aisle ${aisleId}: no feasible XNA storage path handover\u2192rack_aisle_${aisleId} (non-storage travel edges must be \u2265 4.00m; same-aisle rack_aisle width must be 1.75\u20131.80m; storage_aisle is not valid for XNA).`,
              nodeIds: [ho.id, rackNode.id],
            })
          }
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
