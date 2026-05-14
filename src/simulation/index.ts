import type { SimGraph, SimResult, AisleResult, PathResult } from './types'
import type { AppSettings } from '../graph/types'
import { dijkstra, reconstructPath } from './dijkstra'
import type { DijkstraEdge } from './dijkstra'

const SPEED_XQE = 2.0  // m/s
const SPEED_XNA = 1.5  // m/s

function createRng(seed?: number): () => number {
  if (!Number.isFinite(seed)) return Math.random
  let state = Math.trunc(seed) >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

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

export function runSimulation(graph: SimGraph, settings?: AppSettings): SimResult {
  const aisles: AisleResult[] = []
  const excludedStorages: Array<{ storageNodeId: string; reason: string }> = []
  const dispatchCandidates: Array<{
    storageNodeId: string
    aisleId?: number
    branch: 'XQE' | 'XPL' | 'unknown'
    handoverNodeId?: string
    cost: number
  }> = []

  const sourceGate = graph.nodes.find(n => n.kind === 'source_gate')
  if (!sourceGate) {
    return { aisles: [] }
  }
  const outboundGates = graph.nodes.filter((n) => n.kind === 'outbound_gate')

  // Determine site rack mode
  const rackEdges = graph.edges.filter(e => e.preset === 'rack_aisle')
  const xnaCount = rackEdges.filter(e => e.widthM >= 1.75 && e.widthM <= 1.80).length
  const xqeCount = rackEdges.filter(e => e.widthM >= 2.84).length
  const siteMode: 'XNA' | 'XQE' | null =
    xnaCount > 0 && xqeCount === 0 ? 'XNA' :
    xqeCount > 0 && xnaCount === 0 ? 'XQE' : null

  const speed = siteMode === 'XNA' ? SPEED_XNA : SPEED_XQE
  const sim = settings?.simulator
  const rng = createRng(sim?.randomSeed)
  const selectedStorageTypes = new Set(sim?.storageTypesInUse ?? [])
  const useRack = selectedStorageTypes.has('rack')
  const useGroundStorage = selectedStorageTypes.has('ground_storage')
  const useGroundStacking = selectedStorageTypes.has('ground_stacking')
  const isGroundNodeActive = (n: SimGraph['nodes'][number]) => {
    if (n.kind !== 'ground_storage') return false
    if (!useGroundStorage && !useGroundStacking) return false
    if (!n.storageType) return true
    return selectedStorageTypes.has(n.storageType)
  }
  const isRackNodeActive = (n: SimGraph['nodes'][number]) => n.kind === 'rack_aisle' && useRack

  // Get unique aisle IDs
  const aisleIdsSet = new Set<number>()
  for (const e of graph.edges) {
    if ((e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle') || e.aisleId == null) continue
    const s = graph.nodes.find((n) => n.id === e.source)
    const t = graph.nodes.find((n) => n.id === e.target)
    const hasEligibleNode = [s, t].some((n) => !!n && (isRackNodeActive(n) || isGroundNodeActive(n)))
    if (hasEligibleNode) aisleIdsSet.add(e.aisleId)
  }
  for (const n of graph.nodes) {
    if (n.aisleId == null) continue
    if (isRackNodeActive(n) || isGroundNodeActive(n)) aisleIdsSet.add(n.aisleId)
  }
  const aisleIds = Array.from(aisleIdsSet)

  // Non-rack adjacency for distance computation
  const nonRackAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle')
  const {dist: distFromSG} = dijkstra(nonRackAdj, sourceGate.id)
  const allAdj = buildAdj(graph.edges)
  const {dist: allDistFromSG} = dijkstra(allAdj, sourceGate.id)
  const distFromOutboundByGate = outboundGates.map((og) => dijkstra(allAdj, og.id).dist)

  const allHandoverNodes = graph.nodes.filter((n) => n.kind === 'handover')
  const distFromHandoverAll = new Map<string, Map<string, number>>()
  for (const ho of allHandoverNodes) {
    distFromHandoverAll.set(ho.id, dijkstra(allAdj, ho.id).dist)
  }
  const useGround = useGroundStorage || useGroundStacking
  const inboundDaily = Math.max(0, Number.isFinite(sim?.inboundDailyPallets) ? (sim?.inboundDailyPallets as number) : 0)
  const outboundDaily = Math.max(0, Number.isFinite(sim?.outboundDailyPallets) ? (sim?.outboundDailyPallets as number) : 0)
  const totalFlowTasks = inboundDaily + outboundDaily
  const totalTasks = useGround ? totalFlowTasks : (sim?.rackDailyPallets ?? 0)

  for (const aisleId of aisleIds) {
    const storageEdgeNodeIds = new Set(
      graph.edges
        .filter((e) => (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') && e.aisleId === aisleId)
        .flatMap((e) => [e.source, e.target])
    )
    const rackNodes = graph.nodes.filter((n) =>
      (isRackNodeActive(n) && n.aisleId === aisleId) ||
      (isGroundNodeActive(n) && storageEdgeNodeIds.has(n.id))
    )

    if (rackNodes.length === 0) {
      aisles.push({aisleId, distanceToHandover: 0, branch: 'unknown', error: 'Missing storage node for aisle'})
      continue
    }
    const rackNode = rackNodes[0]
    const sourceToStorageDistances = rackNodes
      .map((n) => allDistFromSG.get(n.id))
      .filter((d): d is number => d != null)
    const storageToOutboundDistances = rackNodes
      .map((n) => {
        if (distFromOutboundByGate.length === 0) return Number.POSITIVE_INFINITY
        const d = distFromOutboundByGate
          .map((m) => m.get(n.id) ?? Number.POSITIVE_INFINITY)
          .reduce((min, v) => Math.min(min, v), Number.POSITIVE_INFINITY)
        return d
      })
      .filter((d) => Number.isFinite(d))
    const sourceToStorage = sourceToStorageDistances.length > 0
      ? sourceToStorageDistances.reduce((s, d) => s + d, 0) / sourceToStorageDistances.length
      : Number.POSITIVE_INFINITY
    const storageToOutbound = storageToOutboundDistances.length > 0
      ? storageToOutboundDistances.reduce((s, d) => s + d, 0) / storageToOutboundDistances.length
      : 0
    // Handover is needed when horizontal transport on inbound or outbound side is long.
    const needsHandover = (sourceToStorage ?? 0) >= 50 || (storageToOutbound ?? 0) >= 50
    let chosenHandoverNode = undefined as (typeof allHandoverNodes[number] | undefined)
    let chosenHoSourceDist = Number.POSITIVE_INFINITY
    if (needsHandover && allHandoverNodes.length > 0) {
      const aisleTagged = allHandoverNodes.filter((h) => h.aisleId === aisleId)
      const shared = allHandoverNodes.filter((h) => h.aisleId == null)
      const preferred = aisleTagged.length > 0 ? aisleTagged : shared
      const candidates = preferred.length > 0 ? preferred : allHandoverNodes
      for (const ho of candidates) {
        const hoDist = distFromSG.get(ho.id)
        if (hoDist == null) continue
        if (hoDist < chosenHoSourceDist) {
          chosenHoSourceDist = hoDist
          chosenHandoverNode = ho
        }
      }
    }
    if (needsHandover && !chosenHandoverNode) {
      aisles.push({aisleId, distanceToHandover: 0, branch: 'XPL', error: 'Missing handover for >=50m source->storage path'})
      continue
    }
    if (!needsHandover) {
      // Direct storage routing without handover under 50m rule.
      let rackPath: PathResult | undefined
      const rackAdj = buildAdj(graph.edges, e => {
        if (siteMode === 'XNA') {
          if (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') return e.aisleId === aisleId && e.widthM >= 1.75 && e.widthM <= 1.80
          return e.widthM >= 4.0
        }
        if (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') return e.aisleId === aisleId && e.widthM >= 2.84
        return e.widthM >= 2.84
      })
      const {dist: rDist, prev: rPrev} = dijkstra(rackAdj, sourceGate.id)
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
      aisles.push({
        aisleId,
        distanceToHandover: 0,
        branch: 'XQE',
        handoverNodeId: undefined,
        storageNodeIds: rackNodes.map((n) => n.id),
        handoverPath: undefined,
        rackPath,
      })
      for (const n of rackNodes) {
        const d = allDistFromSG.get(n.id) ?? 50
        dispatchCandidates.push({
          storageNodeId: n.id,
          aisleId,
          branch: 'XQE',
          handoverNodeId: undefined,
          cost: Math.max(1, d),
        })
      }
      continue
    }
    const handoverNode = chosenHandoverNode!
    const distanceToHandover = distFromSG.get(handoverNode.id)
    if (distanceToHandover == null) {
      aisles.push({aisleId, distanceToHandover: 0, branch: 'unknown', error: 'Handover unreachable from source_gate'})
      continue
    }

    // Business rule: if handover is required (source->storage >= 50m),
    // horizontal transport must be XPL for SG->HO leg.
    const branch: 'XQE' | 'XPL' = 'XPL'
    const minWidth = 2.60

    // Handover path
    const handoverAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle' && e.widthM >= minWidth)
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
    let rackPath: PathResult | undefined

    if (siteMode === 'XQE') {
      const rackAdj = buildAdj(graph.edges, e => {
        if (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') return e.aisleId === aisleId && e.widthM >= 2.84
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
        if (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') return e.aisleId === aisleId && e.widthM >= 1.75 && e.widthM <= 1.80
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
      handoverNodeId: handoverNode.id,
      storageNodeIds: rackNodes.map((n) => n.id),
      handoverPath,
      rackPath,
    })
    for (const n of rackNodes) {
      const preferred = allHandoverNodes.filter((h) => h.aisleId === aisleId)
      const shared = allHandoverNodes.filter((h) => h.aisleId == null)
      const candidates = preferred.length > 0 ? preferred : (shared.length > 0 ? shared : allHandoverNodes)
      let chosenHo: string | undefined
      let best = Number.POSITIVE_INFINITY
      for (const ho of candidates) {
        const d = distFromHandoverAll.get(ho.id)?.get(n.id)
        if (d != null && d < best) {
          best = d
          chosenHo = ho.id
        }
      }
      dispatchCandidates.push({
        storageNodeId: n.id,
        aisleId,
        branch: 'XPL',
        handoverNodeId: chosenHo,
        cost: Math.max(1, best),
      })
    }
  }

  if (totalTasks > 0 && aisles.length > 0) {
    const weights = aisles.map((a) => {
      const dist = (a.rackPath?.distanceM ?? 0) + (a.handoverPath?.distanceM ?? 0)
      return dist > 0 ? 1 / dist : 1
    })
    const sumW = weights.reduce((s, w) => s + w, 0) || 1
    let remaining = totalTasks
    aisles.forEach((a, i) => {
      const assigned = i === aisles.length - 1 ? Math.max(0, remaining) : Math.max(0, Math.floor((weights[i] / sumW) * totalTasks))
      a.assignedTasks = assigned
      remaining -= assigned
    })
  }

  const storageTaskMap = new Map<string, { tasksPerDay: number; aisleId?: number; handoverNodeId?: string; branch: 'XQE' | 'XPL' | 'unknown' }>()
  const activeStorageNodes = graph.nodes.filter((n) => isGroundNodeActive(n) || isRackNodeActive(n))
  const hasStorageEdge = (nodeId: string) =>
    graph.edges.some((e) => (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') && (e.source === nodeId || e.target === nodeId))
  if (dispatchCandidates.length <= 1 && activeStorageNodes.length > dispatchCandidates.length) {
    const existing = new Set(dispatchCandidates.map((d) => d.storageNodeId))
    const handoverAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle' && e.widthM >= 2.60)
    const { dist: hoReachDist } = dijkstra(handoverAdj, sourceGate.id)
    for (const n of activeStorageNodes) {
      if (existing.has(n.id)) continue
      if (!hasStorageEdge(n.id)) {
        excludedStorages.push({ storageNodeId: n.id, reason: 'No storage_aisle/rack_aisle edge connected' })
        continue
      }
      const sourceDist = allDistFromSG.get(n.id) ?? Number.POSITIVE_INFINITY
      if (!Number.isFinite(sourceDist)) {
        excludedStorages.push({ storageNodeId: n.id, reason: 'Unreachable from source gate' })
        continue
      }
      // Random outbound gate selection per storage candidate (as requested).
      const outDist = distFromOutboundByGate.length > 0
        ? (distFromOutboundByGate[Math.floor(rng() * distFromOutboundByGate.length)].get(n.id) ?? Number.POSITIVE_INFINITY)
        : 0
      const needsHo = sourceDist >= 50 || outDist >= 50
      let hoId: string | undefined
      if (needsHo) {
        let best = Number.POSITIVE_INFINITY
        for (const ho of allHandoverNodes) {
          const dToStorage = distFromHandoverAll.get(ho.id)?.get(n.id)
          const dFromSource = hoReachDist.get(ho.id)
          if (dToStorage != null && dFromSource != null && dToStorage < best) {
            best = dToStorage
            hoId = ho.id
          }
        }
      }
      dispatchCandidates.push({
        storageNodeId: n.id,
        aisleId: n.aisleId,
        branch: needsHo ? 'XPL' : 'XQE',
        handoverNodeId: hoId,
        cost: Math.max(1, needsHo ? (distFromHandoverAll.get(hoId ?? '')?.get(n.id) ?? sourceDist) : sourceDist),
      })
    }
  }

  if (totalTasks > 0 && dispatchCandidates.length > 0) {
    // Randomized storage selection for task assignment as requested.
    for (let i = 0; i < totalTasks; i += 1) {
      const idx = Math.floor(rng() * dispatchCandidates.length)
      const c = dispatchCandidates[idx]
      const cur = storageTaskMap.get(c.storageNodeId)
      if (cur) {
        cur.tasksPerDay += 1
      } else {
        storageTaskMap.set(c.storageNodeId, {
          tasksPerDay: 1,
          aisleId: c.aisleId,
          handoverNodeId: c.handoverNodeId,
          branch: c.branch,
        })
      }
    }
  }

  for (const a of aisles) {
    a.assignedTasks = 0
    for (const s of storageTaskMap.values()) {
      if (s.aisleId === a.aisleId) a.assignedTasks += s.tasksPerDay
    }
  }

  // Diagnostics for active storages that ended with zero assigned tasks.
  for (const n of activeStorageNodes) {
    if (!storageTaskMap.has(n.id) && !excludedStorages.find((e) => e.storageNodeId === n.id)) {
      excludedStorages.push({ storageNodeId: n.id, reason: 'Active but received zero random assignments in this run' })
    }
  }

  return {
    aisles,
    storageTaskBreakdown: [...storageTaskMap.entries()].map(([storageNodeId, v]) => ({
      storageNodeId,
      tasksPerDay: v.tasksPerDay,
      aisleId: v.aisleId,
      handoverNodeId: v.handoverNodeId,
      branch: v.branch,
    })),
    diagnostics: {
      excludedStorages,
    },
  }
}
