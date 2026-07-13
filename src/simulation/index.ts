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
  const inboundCandidates: Array<{
    storageNodeId: string
    aisleId?: number
    branch: 'XQE' | 'XPL' | 'XNA' | 'unknown'
    handoverNodeId?: string
    storageSideBranch?: 'XQE' | 'XPL' | 'XNA'
    cost: number
    storageCapacity?: number
  }> = []
  const outboundCandidates: Array<{
    storageNodeId: string
    aisleId?: number
    branch: 'XQE' | 'XPL' | 'XNA' | 'unknown'
    handoverNodeId?: string
    storageSideBranch?: 'XQE' | 'XPL' | 'XNA'
    cost: number
    storageCapacity?: number
  }> = []

  const sourceGates = graph.nodes.filter((n) => n.kind === 'source_gate')
  if (sourceGates.length === 0) {
    return { aisles: [] }
  }
  const restPoint = graph.nodes.find((n) => n.kind === 'rest_point') ?? sourceGates[0]
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
  const forceExplicitHandover = !!sim?.forceExplicitHandover
  const inferGroundNodeMode = (n: SimGraph['nodes'][number]): 'ground_storage' | 'ground_stacking' => {
    if (useGroundStacking && !useGroundStorage) return 'ground_stacking'
    if (useGroundStorage && !useGroundStacking) return 'ground_storage'
    if (n.storageType === 'ground_stacking') return 'ground_stacking'
    if (n.storageType === 'ground_storage') return 'ground_storage'
    return 'ground_storage'
  }
  const resolveGroundNodeGeometry = (n: SimGraph['nodes'][number]) => {
    const storageMode = inferGroundNodeMode(n)
    const rows = Math.max(1, n.blockRows ?? sim?.stackingRows ?? 10)
    const cols = Math.max(1, n.blockColumns ?? sim?.stackingColumns ?? 12)
    const rawLevels = Math.max(1, n.blockLevels ?? sim?.stackingLevels ?? 3)
    const levels = storageMode === 'ground_stacking' ? rawLevels : 1
    const boxLengthMm = Math.max(100, n.boxLengthMm ?? sim?.stackingBoxLengthMm ?? 1200)
    const boxWidthMm = Math.max(100, n.boxWidthMm ?? sim?.stackingBoxWidthMm ?? 800)
    const clearanceMm = Math.max(0, n.clearanceMm ?? sim?.stackingClearanceMm ?? 200)
    const effectiveWidthMm = boxWidthMm + 2 * clearanceMm
    const effectiveDepthMm = boxLengthMm + 2 * clearanceMm
    const avgColumnDistanceM = ((cols * effectiveWidthMm) / 2 + clearanceMm) / 1000
    const avgRowDistanceM = ((rows * effectiveDepthMm) / 2 + clearanceMm) / 1000
    const reverseIntoPositionM = (effectiveDepthMm / 2) / 1000
    return {
      storageMode,
      rows,
      cols,
      levels,
      boxLengthMm,
      boxWidthMm,
      clearanceMm,
      averageInternalTravelM: avgColumnDistanceM + avgRowDistanceM + reverseIntoPositionM,
      storageCapacity: rows * cols * levels,
    }
  }
  const isGroundNodeActive = (n: SimGraph['nodes'][number]) => {
    if (n.kind !== 'ground_storage') return false
    if (!useGroundStorage && !useGroundStacking) return false
    // Ground nodes share the same physical storage network. Keep them active in
    // dispatch even if individual node labels differ (store vs stack), so tasks
    // can distribute across all eligible ground locations.
    return true
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
  const nodeAisleId = new Map<string, number>()
  for (const n of graph.nodes) {
    if (n.aisleId != null) nodeAisleId.set(n.id, n.aisleId)
  }
  for (const e of graph.edges) {
    if ((e.preset === 'rack_aisle' || e.preset === 'storage_aisle') && e.aisleId != null) {
      if (!nodeAisleId.has(e.source)) nodeAisleId.set(e.source, e.aisleId)
      if (!nodeAisleId.has(e.target)) nodeAisleId.set(e.target, e.aisleId)
    }
  }

  // Non-rack adjacency for distance computation
  const nonRackAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle')
  const allAdj = buildAdj(graph.edges)
  const nonRackDistBySource = sourceGates.map((sg) => ({
    sourceId: sg.id,
    dist: dijkstra(nonRackAdj, sg.id).dist,
  }))
  const allDistBySource = sourceGates.map((sg) => ({
    sourceId: sg.id,
    dist: dijkstra(allAdj, sg.id).dist,
  }))
  const {dist: allDistFromRest} = dijkstra(allAdj, restPoint.id)
  const distFromOutboundByGate = outboundGates.map((og) => dijkstra(allAdj, og.id).dist)
  const nearestSourceForNode = (nodeId: string, useAllEdges: boolean): { sourceId: string; distance: number } | null => {
    const maps = useAllEdges ? allDistBySource : nonRackDistBySource
    let best: { sourceId: string; distance: number } | null = null
    for (const entry of maps) {
      const d = entry.dist.get(nodeId)
      if (d == null) continue
      if (!best || d < best.distance) {
        best = { sourceId: entry.sourceId, distance: d }
      }
    }
    return best
  }

  const allHandoverNodes = graph.nodes.filter((n) => n.kind === 'handover')
  const distFromHandoverAll = new Map<string, Map<string, number>>()
  for (const ho of allHandoverNodes) {
    distFromHandoverAll.set(ho.id, dijkstra(allAdj, ho.id).dist)
  }
  const useGround = useGroundStorage || useGroundStacking
  const inboundDaily = Math.max(0, Number.isFinite(sim?.inboundDailyPallets) ? (sim?.inboundDailyPallets as number) : 0)
  const outboundDaily = Math.max(0, Number.isFinite(sim?.outboundDailyPallets) ? (sim?.outboundDailyPallets as number) : 0)

  const buildStorageLegAdj = (aisleId: number) => buildAdj(graph.edges, e => {
    if (siteMode === 'XNA') {
      if (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') {
        return e.aisleId === aisleId && e.widthM >= 1.75 && e.widthM <= 1.80
      }
      return e.widthM >= 4.0
    }
    if (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') {
      return e.aisleId === aisleId && e.widthM >= 2.84
    }
    return e.widthM >= 2.84
  })

  const getPreferredHandoversForAisle = (
    aisleId: number,
    storageNodes: SimGraph['nodes']
  ): SimGraph['nodes'] => {
    const aisleTagged = allHandoverNodes.filter((h) => h.aisleId === aisleId)
    if (aisleTagged.length > 0) return aisleTagged
    const shared = allHandoverNodes.filter((h) => h.aisleId == null)
    const candidatePool = shared.length > 0 ? shared : allHandoverNodes
    if (!forceExplicitHandover || storageNodes.length === 0) return candidatePool
    const storageLegAdj = buildStorageLegAdj(aisleId)
    return candidatePool.filter((ho) => {
      const { dist } = dijkstra(storageLegAdj, ho.id)
      return storageNodes.some((n) => dist.has(n.id))
    })
  }

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
      .map((n) => nearestSourceForNode(n.id, true)?.distance)
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
    const inferredMode = rackNode.kind === 'ground_storage' ? inferGroundNodeMode(rackNode) : 'rack'
    const directBranch: 'XQE' | 'XPL' | 'XNA' =
      inferredMode === 'ground_storage' ? 'XPL' : (rackNode.kind === 'rack_aisle' && siteMode === 'XNA' ? 'XNA' : 'XQE')
    const preferredHandovers = getPreferredHandoversForAisle(aisleId, rackNodes)
    const explicitHandoverRequested =
      forceExplicitHandover &&
      inferredMode !== 'ground_storage' &&
      preferredHandovers.length > 0
    const needsHandover =
      inferredMode === 'ground_storage'
        ? false
        : explicitHandoverRequested || (sourceToStorage >= 50 || storageToOutbound >= 50)
    let chosenHandoverNode = undefined as (typeof allHandoverNodes[number] | undefined)
    let chosenSourceGateId = sourceGates[0].id
    let chosenHoSourceDist = Number.POSITIVE_INFINITY
    if (needsHandover && allHandoverNodes.length > 0) {
      const candidates = preferredHandovers.length > 0 ? preferredHandovers : allHandoverNodes
      for (const ho of candidates) {
        const nearest = nearestSourceForNode(ho.id, false)
        if (!nearest) continue
        if (nearest.distance < chosenHoSourceDist) {
          chosenHoSourceDist = nearest.distance
          chosenHandoverNode = ho
          chosenSourceGateId = nearest.sourceId
        }
      }
    }
    if (!needsHandover) {
      const nearestStorageSource = nearestSourceForNode(rackNode.id, true)
      if (nearestStorageSource) chosenSourceGateId = nearestStorageSource.sourceId
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
      const {dist: rDist, prev: rPrev} = dijkstra(rackAdj, chosenSourceGateId)
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
        branch: directBranch,
        handoverNodeId: undefined,
        storageNodeIds: rackNodes.map((n) => n.id),
        handoverPath: undefined,
        rackPath,
      })
      continue
    }
    const handoverNode = chosenHandoverNode!
    const {dist: chosenSourceToNonRackDist} = dijkstra(nonRackAdj, chosenSourceGateId)
    const distanceToHandover = chosenSourceToNonRackDist.get(handoverNode.id)
    if (distanceToHandover == null) {
      aisles.push({aisleId, distanceToHandover: 0, branch: 'unknown', error: 'Handover unreachable from source_gate'})
      continue
    }

    // Business rule: if handover is required (source->storage >= 50m),
    // horizontal transport must be XPL for SG->HO leg.
    const branch: 'XPL' = 'XPL'
    const minWidth = 2.60

    // Handover path
    const handoverAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle' && e.widthM >= minWidth)
    const {dist: hoDist, prev: hoPrev} = dijkstra(handoverAdj, chosenSourceGateId)

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
  }

  if (inboundDaily + outboundDaily > 0 && aisles.length > 0) {
    const weights = aisles.map((a) => {
      const dist = (a.rackPath?.distanceM ?? 0) + (a.handoverPath?.distanceM ?? 0)
      return dist > 0 ? 1 / dist : 1
    })
    const sumW = weights.reduce((s, w) => s + w, 0) || 1
    let remaining = inboundDaily + outboundDaily
    aisles.forEach((a, i) => {
      const assigned = i === aisles.length - 1 ? Math.max(0, remaining) : Math.max(0, Math.floor((weights[i] / sumW) * (inboundDaily + outboundDaily)))
      a.assignedTasks = assigned
      remaining -= assigned
    })
  }

  const storageTaskMap = new Map<string, {
    tasksPerDay: number
    inboundTasksPerDay: number
    outboundTasksPerDay: number
    aisleId?: number
    handoverNodeId?: string
    inboundHandoverNodeId?: string
    outboundHandoverNodeId?: string
    storageMode: 'rack' | 'ground_storage' | 'ground_stacking'
    blockRows?: number
    blockColumns?: number
    blockLevels?: number
    boxLengthMm?: number
    boxWidthMm?: number
    clearanceMm?: number
    storageCapacity?: number
    inboundHandover: boolean
    outboundHandover: boolean
    inboundBranch: string
    outboundBranch: string
    inboundStorageSideBranch?: 'XQE' | 'XPL' | 'XNA'
    outboundStorageSideBranch?: 'XQE' | 'XPL' | 'XNA'
  }>()
  const inboundRouteLoad = new Map<number, number>()
  const outboundRouteLoad = new Map<number, number>()
  const activeStorageNodes = graph.nodes.filter((n) => isGroundNodeActive(n) || isRackNodeActive(n))
  const activeStorageNodeById = new Map(activeStorageNodes.map((n) => [n.id, n] as const))
  {
    const existingInbound = new Set(inboundCandidates.map((d) => d.storageNodeId))
    const existingOutbound = new Set(outboundCandidates.map((d) => d.storageNodeId))
    const handoverAdj = buildAdj(graph.edges, e => e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle' && e.widthM >= 2.60)
    const nonRackDistBySourceForHo = sourceGates.map((sg) => ({
      sourceId: sg.id,
      dist: dijkstra(handoverAdj, sg.id).dist,
    }))
    for (const n of activeStorageNodes) {
      const nearestSourceToStorage = nearestSourceForNode(n.id, true)
      const sourceDist = nearestSourceToStorage?.distance ?? Number.POSITIVE_INFINITY
      if (!Number.isFinite(sourceDist)) {
        excludedStorages.push({ storageNodeId: n.id, reason: 'Unreachable from source gate' })
        continue
      }
      const chosenInboundSourceId = nearestSourceToStorage?.sourceId ?? sourceGates[0].id
      const groundGeometry = n.kind === 'ground_storage' ? resolveGroundNodeGeometry(n) : null
      const inferredMode = groundGeometry?.storageMode ?? 'rack'
      const directBranch: 'XQE' | 'XPL' | 'XNA' =
        inferredMode === 'ground_storage' ? 'XPL' : (n.kind === 'rack_aisle' && siteMode === 'XNA' ? 'XNA' : 'XQE')
      const bestOutbound = distFromOutboundByGate.length > 0
        ? distFromOutboundByGate.reduce((min, map) => Math.min(min, map.get(n.id) ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY)
        : 0
      const storageAisleId = nodeAisleId.get(n.id)
      const preferredHandovers = storageAisleId != null ? getPreferredHandoversForAisle(storageAisleId, [n]) : []
      const explicitHandoverRequested =
        forceExplicitHandover &&
        inferredMode !== 'ground_storage' &&
        preferredHandovers.length > 0
      const inboundNeedsHo =
        inferredMode === 'ground_storage'
          ? false
          : explicitHandoverRequested || sourceDist >= 50
      const outboundNeedsHo =
        inferredMode === 'ground_storage'
          ? false
          : explicitHandoverRequested || (Number.isFinite(bestOutbound) ? bestOutbound : 0) >= 50
      let hoId: string | undefined
      if (inboundNeedsHo || outboundNeedsHo) {
        let best = Number.POSITIVE_INFINITY
        const hoCandidates = preferredHandovers.length > 0 ? preferredHandovers : allHandoverNodes
        for (const ho of hoCandidates) {
          const dToStorage = distFromHandoverAll.get(ho.id)?.get(n.id)
          const dFromSource = nonRackDistBySourceForHo
            .map((entry) => entry.dist.get(ho.id))
            .filter((d): d is number => d != null)
            .reduce((min, d) => Math.min(min, d), Number.POSITIVE_INFINITY)
          if (dToStorage != null && dFromSource != null && dToStorage < best) {
            best = dToStorage
            hoId = ho.id
          }
        }
        if (!hoId) {
          excludedStorages.push({ storageNodeId: n.id, reason: 'Needs handover but no reachable handover' })
          continue
        }
      }
      const storageSideBranch: 'XQE' | 'XNA' = n.kind === 'rack_aisle' && siteMode === 'XNA' ? 'XNA' : 'XQE'
      if (!existingInbound.has(n.id)) {
        if (inboundNeedsHo) {
          const restToHo = allDistFromRest.get(hoId ?? '') ?? 0
          const sourceToHo = nonRackDistBySourceForHo
            .find((entry) => entry.sourceId === chosenInboundSourceId)
            ?.dist.get(hoId ?? '') ?? 0
          const hoToStorage = distFromHandoverAll.get(hoId ?? '')?.get(n.id) ?? sourceDist
          const restToStorage = allDistFromRest.get(n.id) ?? 0
          inboundCandidates.push({
            storageNodeId: n.id,
            aisleId: nodeAisleId.get(n.id),
            branch: 'XPL',
            handoverNodeId: hoId,
            storageSideBranch: storageSideBranch,
            cost: Math.max(1, restToHo + sourceToHo + restToHo + restToStorage + hoToStorage + (groundGeometry?.averageInternalTravelM ?? 0) + restToStorage),
            storageCapacity: groundGeometry?.storageCapacity ?? 1,
          })
        } else {
          const inboundCost = (allDistFromRest.get(chosenInboundSourceId) ?? 0) + sourceDist + (groundGeometry?.averageInternalTravelM ?? 0) + (allDistFromRest.get(n.id) ?? 0)
          inboundCandidates.push({
            storageNodeId: n.id,
            aisleId: nodeAisleId.get(n.id),
            branch: directBranch,
            handoverNodeId: undefined,
            storageSideBranch: directBranch,
            cost: Math.max(1, inboundCost),
            storageCapacity: groundGeometry?.storageCapacity ?? 1,
          })
        }
      }
      if (!existingOutbound.has(n.id)) {
        if (outboundNeedsHo) {
          const restToHo = allDistFromRest.get(hoId ?? '') ?? 0
          const hoToStorage = distFromHandoverAll.get(hoId ?? '')?.get(n.id) ?? sourceDist
          const restToStorage = allDistFromRest.get(n.id) ?? 0
          const bestOutboundDist = distFromOutboundByGate.length > 0
            ? distFromOutboundByGate.reduce((min, map) => Math.min(min, map.get(hoId ?? '') ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY)
            : 0
          outboundCandidates.push({
            storageNodeId: n.id,
            aisleId: nodeAisleId.get(n.id),
            branch: storageSideBranch,
            handoverNodeId: hoId,
            storageSideBranch: storageSideBranch,
            cost: Math.max(1, restToStorage + (groundGeometry?.averageInternalTravelM ?? 0) + hoToStorage + restToStorage + restToHo + (Number.isFinite(bestOutboundDist) ? bestOutboundDist : 0) + restToHo),
            storageCapacity: groundGeometry?.storageCapacity ?? 1,
          })
        } else {
          const outboundCost = (allDistFromRest.get(n.id) ?? 0) + (groundGeometry?.averageInternalTravelM ?? 0) + (Number.isFinite(bestOutbound) ? bestOutbound : 0) + (distFromOutboundByGate.length > 0 ? Number.isFinite(bestOutbound) ? bestOutbound : 0 : (allDistFromRest.get(n.id) ?? 0))
          outboundCandidates.push({
            storageNodeId: n.id,
            aisleId: nodeAisleId.get(n.id),
            branch: directBranch,
            handoverNodeId: undefined,
            storageSideBranch: directBranch,
            cost: Math.max(1, outboundCost),
            storageCapacity: groundGeometry?.storageCapacity ?? 1,
          })
        }
      }
    }
  }

  const assignTasks = (
    taskCount: number,
    candidates: typeof inboundCandidates,
    routeLoad: Map<number, number>,
    direction: 'inbound' | 'outbound'
  ) => {
    if (taskCount <= 0 || candidates.length === 0) return
    const shuffled = [...candidates]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = tmp
    }
    const baseAssignments = Math.min(taskCount, shuffled.length)
    for (let i = 0; i < baseAssignments; i += 1) {
      const c = shuffled[i]
      const cur = storageTaskMap.get(c.storageNodeId)
      if (cur) {
        cur.tasksPerDay += 1
        if (direction === 'inbound') {
          cur.inboundTasksPerDay += 1
          cur.inboundBranch = c.branch
          cur.inboundHandover = !!c.handoverNodeId
          cur.inboundHandoverNodeId = c.handoverNodeId
          cur.inboundStorageSideBranch = c.storageSideBranch
        } else {
          cur.outboundTasksPerDay += 1
          cur.outboundBranch = c.branch
          cur.outboundHandover = !!c.handoverNodeId
          cur.outboundHandoverNodeId = c.handoverNodeId
          cur.outboundStorageSideBranch = c.storageSideBranch
        }
      } else {
        const node = activeStorageNodeById.get(c.storageNodeId)
        const groundGeometry = node?.kind === 'ground_storage' ? resolveGroundNodeGeometry(node) : null
        storageTaskMap.set(c.storageNodeId, {
          tasksPerDay: 1,
          inboundTasksPerDay: direction === 'inbound' ? 1 : 0,
          outboundTasksPerDay: direction === 'outbound' ? 1 : 0,
          aisleId: c.aisleId,
          handoverNodeId: c.handoverNodeId,
          inboundHandoverNodeId: direction === 'inbound' ? c.handoverNodeId : undefined,
          outboundHandoverNodeId: direction === 'outbound' ? c.handoverNodeId : undefined,
          storageMode: node?.kind === 'ground_storage' ? inferGroundNodeMode(node) : 'rack',
          blockRows: groundGeometry?.rows,
          blockColumns: groundGeometry?.cols,
          blockLevels: groundGeometry?.levels,
          boxLengthMm: groundGeometry?.boxLengthMm,
          boxWidthMm: groundGeometry?.boxWidthMm,
          clearanceMm: groundGeometry?.clearanceMm,
          storageCapacity: groundGeometry?.storageCapacity ?? c.storageCapacity ?? 1,
          inboundHandover: direction === 'inbound' ? !!c.handoverNodeId : false,
          outboundHandover: direction === 'outbound' ? !!c.handoverNodeId : false,
          inboundBranch: direction === 'inbound' ? c.branch : 'unknown',
          outboundBranch: direction === 'outbound' ? c.branch : 'unknown',
          inboundStorageSideBranch: direction === 'inbound' ? c.storageSideBranch : undefined,
          outboundStorageSideBranch: direction === 'outbound' ? c.storageSideBranch : undefined,
        })
      }
      if (c.aisleId != null) routeLoad.set(c.aisleId, (routeLoad.get(c.aisleId) ?? 0) + 1)
    }
    for (let i = baseAssignments; i < taskCount; i += 1) {
      const poolSize = Math.min(5, candidates.length)
      let best: typeof candidates[number] | undefined
      let bestScore = Number.POSITIVE_INFINITY
      for (let k = 0; k < poolSize; k += 1) {
        const idx = Math.floor(rng() * candidates.length)
        const c = candidates[idx]
        const load = c.aisleId != null ? (routeLoad.get(c.aisleId) ?? 0) : 0
        const capacity = Math.max(1, c.storageCapacity ?? 1)
        const score = (c.cost / Math.sqrt(capacity)) * (1 + load / capacity)
        if (score < bestScore) {
          bestScore = score
          best = c
        }
      }
      const c = best ?? candidates[Math.floor(rng() * candidates.length)]
      const cur = storageTaskMap.get(c.storageNodeId)
      if (cur) {
        cur.tasksPerDay += 1
        if (direction === 'inbound') {
          cur.inboundTasksPerDay += 1
          cur.inboundBranch = c.branch
          cur.inboundHandover = !!c.handoverNodeId
          cur.inboundHandoverNodeId = c.handoverNodeId
          cur.inboundStorageSideBranch = c.storageSideBranch
        } else {
          cur.outboundTasksPerDay += 1
          cur.outboundBranch = c.branch
          cur.outboundHandover = !!c.handoverNodeId
          cur.outboundHandoverNodeId = c.handoverNodeId
          cur.outboundStorageSideBranch = c.storageSideBranch
        }
      } else {
        const node = activeStorageNodeById.get(c.storageNodeId)
        const groundGeometry = node?.kind === 'ground_storage' ? resolveGroundNodeGeometry(node) : null
        storageTaskMap.set(c.storageNodeId, {
          tasksPerDay: 1,
          inboundTasksPerDay: direction === 'inbound' ? 1 : 0,
          outboundTasksPerDay: direction === 'outbound' ? 1 : 0,
          aisleId: c.aisleId,
          handoverNodeId: c.handoverNodeId,
          inboundHandoverNodeId: direction === 'inbound' ? c.handoverNodeId : undefined,
          outboundHandoverNodeId: direction === 'outbound' ? c.handoverNodeId : undefined,
          storageMode: node?.kind === 'ground_storage' ? inferGroundNodeMode(node) : 'rack',
          blockRows: groundGeometry?.rows,
          blockColumns: groundGeometry?.cols,
          blockLevels: groundGeometry?.levels,
          boxLengthMm: groundGeometry?.boxLengthMm,
          boxWidthMm: groundGeometry?.boxWidthMm,
          clearanceMm: groundGeometry?.clearanceMm,
          storageCapacity: groundGeometry?.storageCapacity ?? c.storageCapacity ?? 1,
          inboundHandover: direction === 'inbound' ? !!c.handoverNodeId : false,
          outboundHandover: direction === 'outbound' ? !!c.handoverNodeId : false,
          inboundBranch: direction === 'inbound' ? c.branch : 'unknown',
          outboundBranch: direction === 'outbound' ? c.branch : 'unknown',
          inboundStorageSideBranch: direction === 'inbound' ? c.storageSideBranch : undefined,
          outboundStorageSideBranch: direction === 'outbound' ? c.storageSideBranch : undefined,
        })
      }
      if (c.aisleId != null) routeLoad.set(c.aisleId, (routeLoad.get(c.aisleId) ?? 0) + 1)
    }
  }
  assignTasks(inboundDaily, inboundCandidates, inboundRouteLoad, 'inbound')
  assignTasks(outboundDaily, outboundCandidates, outboundRouteLoad, 'outbound')

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

  const workloadBuckets = {
    horizontal_xpl_inbound: 0,
    horizontal_xpl_outbound: 0,
    horizontal_xqe_inbound: 0,
    horizontal_xqe_outbound: 0,
    stacking_xqe_inbound: 0,
    stacking_xqe_outbound: 0,
    horizontal_xpl: 0,
    horizontal_xqe: 0,
    stacking_xqe: 0,
  }

  for (const [storageNodeId, value] of storageTaskMap.entries()) {
    const mode = value.storageMode
    if (value.inboundHandover) {
      workloadBuckets.horizontal_xpl_inbound += value.inboundTasksPerDay
      if (value.inboundStorageSideBranch === 'XQE' || value.inboundStorageSideBranch === 'XNA') {
        workloadBuckets.horizontal_xqe_inbound += value.inboundTasksPerDay
      }
    } else if (value.inboundBranch === 'XPL') {
      workloadBuckets.horizontal_xpl_inbound += value.inboundTasksPerDay
    } else if (value.inboundBranch === 'XQE' || value.inboundBranch === 'XNA') {
      workloadBuckets.horizontal_xqe_inbound += value.inboundTasksPerDay
    }

    if (value.outboundHandover) {
      workloadBuckets.horizontal_xpl_outbound += value.outboundTasksPerDay
      if (value.outboundStorageSideBranch === 'XQE' || value.outboundStorageSideBranch === 'XNA') {
        workloadBuckets.horizontal_xqe_outbound += value.outboundTasksPerDay
      }
    } else if (value.outboundBranch === 'XPL') {
      workloadBuckets.horizontal_xpl_outbound += value.outboundTasksPerDay
    } else if (value.outboundBranch === 'XQE' || value.outboundBranch === 'XNA') {
      workloadBuckets.horizontal_xqe_outbound += value.outboundTasksPerDay
    }

    if (mode === 'ground_stacking') {
      workloadBuckets.stacking_xqe_inbound += value.inboundTasksPerDay
      workloadBuckets.stacking_xqe_outbound += value.outboundTasksPerDay
    }
  }
  workloadBuckets.horizontal_xpl = workloadBuckets.horizontal_xpl_inbound + workloadBuckets.horizontal_xpl_outbound
  workloadBuckets.horizontal_xqe = workloadBuckets.horizontal_xqe_inbound + workloadBuckets.horizontal_xqe_outbound
  workloadBuckets.stacking_xqe = workloadBuckets.stacking_xqe_inbound + workloadBuckets.stacking_xqe_outbound

  return {
    aisles,
    workloadBuckets,
    storageTaskBreakdown: [...storageTaskMap.entries()].map(([storageNodeId, v]) => ({
      storageNodeId,
      tasksPerDay: v.tasksPerDay,
      inboundTasksPerDay: v.inboundTasksPerDay,
      outboundTasksPerDay: v.outboundTasksPerDay,
      aisleId: v.aisleId,
      handoverNodeId: v.handoverNodeId,
      inboundHandoverNodeId: v.inboundHandoverNodeId,
      outboundHandoverNodeId: v.outboundHandoverNodeId,
      storageMode: v.storageMode,
      blockRows: v.blockRows,
      blockColumns: v.blockColumns,
      blockLevels: v.blockLevels,
      boxLengthMm: v.boxLengthMm,
      boxWidthMm: v.boxWidthMm,
      clearanceMm: v.clearanceMm,
      storageCapacity: v.storageCapacity,
      inboundStorageSideBranch: v.inboundStorageSideBranch,
      outboundStorageSideBranch: v.outboundStorageSideBranch,
      inboundBranch: v.inboundHandover
        ? `XPL+${v.inboundStorageSideBranch ?? v.inboundBranch}`
        : v.inboundBranch,
      outboundBranch: v.outboundHandover
        ? `${v.outboundStorageSideBranch ?? v.outboundBranch}+XPL`
        : v.outboundBranch,
    })),
    diagnostics: {
      excludedStorages,
    },
  }
}
