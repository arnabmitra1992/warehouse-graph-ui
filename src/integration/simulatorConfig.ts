import type { SimGraph } from '../simulation/types'
import type { DijkstraEdge } from '../simulation/dijkstra'
import { dijkstra } from '../simulation/dijkstra'
import type { AppSettings } from '../graph/types'

type JsonObject = Record<string, unknown>

function toMm(meters: number, fallbackMm: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return fallbackMm
  return Math.max(1, Math.round(meters * 1000))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function buildAdj(
  edges: SimGraph['edges'],
  filter?: (edge: SimGraph['edges'][0]) => boolean
): Map<string, DijkstraEdge[]> {
  const adj = new Map<string, DijkstraEdge[]>()
  for (const edge of edges) {
    if (filter && !filter(edge)) continue
    if (!adj.has(edge.source)) adj.set(edge.source, [])
    if (!adj.has(edge.target)) adj.set(edge.target, [])
    adj.get(edge.source)!.push({ neighbor: edge.target, weight: edge.length, edgeId: edge.id })
    adj.get(edge.target)!.push({ neighbor: edge.source, weight: edge.length, edgeId: edge.id })
  }
  return adj
}

function detectRackMode(graph: SimGraph): 'XNA' | 'XQE' {
  const rackEdges = graph.edges.filter((e) => e.preset === 'rack_aisle')
  const xnaCount = rackEdges.filter((e) => e.widthM >= 1.75 && e.widthM <= 1.8).length
  const xqeCount = rackEdges.filter((e) => e.widthM >= 2.84).length
  if (xnaCount > 0 && xqeCount === 0) return 'XNA'
  return 'XQE'
}

function deriveGeometry(graph: SimGraph) {
  const sourceGates = graph.nodes.filter((n) => n.kind === 'source_gate')
  const restPoint = graph.nodes.find((n) => n.kind === 'rest_point')
  const aisleIds = Array.from(
    new Set([
      ...graph.nodes
        .filter((n) => n.kind === 'rack_aisle')
        .map((n) => n.aisleId)
        .filter((id): id is number => id != null),
      ...graph.edges
        .filter((e) => (e.preset === 'rack_aisle' || e.preset === 'storage_aisle') && e.aisleId != null)
        .map((e) => e.aisleId as number),
    ])
  )

  const handoverNodes = graph.nodes.filter((n) => n.kind === 'handover' && n.aisleId != null)
  const outboundNodes = graph.nodes.filter((n) => n.kind === 'outbound_gate')
  const rackNodeByAisle = new Map<number, string>()
  for (const n of graph.nodes) {
    if (n.kind === 'rack_aisle' && n.aisleId != null && !rackNodeByAisle.has(n.aisleId)) {
      rackNodeByAisle.set(n.aisleId, n.id)
    }
  }

  const nonRackAdj = buildAdj(graph.edges, (e) => e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle')
  const distFromSourceMaps = sourceGates.map((sg) => dijkstra(nonRackAdj, sg.id).dist)
  const allAdj = buildAdj(graph.edges)
  const distFromRest = restPoint ? dijkstra(allAdj, restPoint.id).dist : new Map<string, number>()
  const headAisleAnchorNodes = graph.nodes.filter((n) => n.kind === 'turn' || n.kind === 'handover')
  const minDistance = (maps: Map<string, number>[], nodeId: string): number | null => {
    let best = Number.POSITIVE_INFINITY
    for (const dist of maps) {
      const d = dist.get(nodeId)
      if (d != null && d < best) best = d
    }
    return Number.isFinite(best) ? best : null
  }

  const sourceToHandover: number[] = []
  for (const h of handoverNodes) {
    const d = minDistance(distFromSourceMaps, h.id)
    if (d != null) sourceToHandover.push(d)
  }
  const sourceToOutbound: number[] = []
  for (const o of outboundNodes) {
    const d = minDistance(distFromSourceMaps, o.id)
    if (d != null) sourceToOutbound.push(d)
  }

  const handoverToRack: number[] = []
  for (const aisleId of aisleIds) {
    const handover = handoverNodes.find((h) => h.aisleId === aisleId)
    const rackNode = rackNodeByAisle.get(aisleId)
    if (!handover || !rackNode) continue
    const aisleAdj = buildAdj(graph.edges, (e) => (e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle') || e.aisleId === aisleId)
    const dist = dijkstra(aisleAdj, handover.id).dist.get(rackNode)
    if (dist != null) handoverToRack.push(dist)
  }

  const rackLengthByAisle = new Map<number, number>()
  for (const e of graph.edges) {
    if (e.preset !== 'rack_aisle' || e.aisleId == null) continue
    rackLengthByAisle.set(e.aisleId, (rackLengthByAisle.get(e.aisleId) ?? 0) + e.length)
  }
  const rackLengths = [...rackLengthByAisle.values()]

  const restToInboundCandidates = sourceGates
    .map((sg) => distFromRest.get(sg.id))
    .filter((d): d is number => d != null && Number.isFinite(d))
  const restToInboundM = median(restToInboundCandidates)
  const restToHeadAisleCandidates = headAisleAnchorNodes
    .map((n) => distFromRest.get(n.id))
    .filter((d): d is number => d != null && Number.isFinite(d))
  const restToHeadAisleM = median(restToHeadAisleCandidates)

  const nonRackWidths = graph.edges
    .filter((e) => e.preset !== 'rack_aisle' && e.preset !== 'storage_aisle')
    .map((e) => e.widthM)
    .filter((w) => Number.isFinite(w) && w > 0)

  const rackWidths = graph.edges
    .filter((e) => e.preset === 'rack_aisle')
    .map((e) => e.widthM)
    .filter((w) => Number.isFinite(w) && w > 0)

  const priorityWeights = { inbound: 0, outbound: 0, shared: 0 }
  for (const e of graph.edges) {
    const w = Math.max(0.1, e.length)
    if (e.priorityStream === 'inbound') priorityWeights.inbound += w
    else if (e.priorityStream === 'outbound') priorityWeights.outbound += w
    else priorityWeights.shared += w
  }
  const inboundWeighted = priorityWeights.inbound + priorityWeights.shared * 0.5
  const outboundWeighted = priorityWeights.outbound + priorityWeights.shared * 0.5
  const totalPriorityWeighted = inboundWeighted + outboundWeighted
  const inboundPriorityShare = totalPriorityWeighted > 0 ? inboundWeighted / totalPriorityWeighted : 0.7
  const outboundPriorityShare = totalPriorityWeighted > 0 ? outboundWeighted / totalPriorityWeighted : 0.3

  return {
    aisleCount: Math.max(1, aisleIds.length),
    restToInboundM,
    restToHeadAisleM,
    sourceToHandoverM: median(sourceToHandover),
    sourceToOutboundM: median(sourceToOutbound),
    handoverToRackM: median(handoverToRack),
    rackLengthM: median(rackLengths),
    nonRackWidthM: median(nonRackWidths),
    rackWidthM: median(rackWidths),
    inboundPriorityShare,
    outboundPriorityShare,
  }
}

export function compileSimulatorConfig(graph: SimGraph, settings?: AppSettings): JsonObject {
  const simInput = settings?.simulator
  const rackMode = detectRackMode(graph)
  const geometry = deriveGeometry(graph)

  const headAisleToHandoverMm = toMm(geometry.sourceToHandoverM ?? 8, 8000)
  const headAisleToOutboundMm = toMm(geometry.sourceToOutboundM ?? 10, 10000)
  const headAisleToRackAisleMm = toMm(geometry.handoverToRackM ?? 6, 6000)
  const rackAisleLengthMm = toMm(geometry.rackLengthM ?? 20, 20000)
  const headAisleWidthMm = toMm(geometry.nonRackWidthM ?? 3.5, 3500)
  const restToInboundMm = toMm(geometry.restToInboundM ?? 5, 5000)
  const restToHeadAisleMm = toMm(
    geometry.restToHeadAisleM ?? (geometry.restToInboundM != null ? Math.max(1, geometry.restToInboundM * 0.6) : 3),
    3000
  )
  const rackAisleWidthMm = toMm(
    geometry.rackWidthM ?? (rackMode === 'XNA' ? 1.77 : 2.84),
    rackMode === 'XNA' ? 1770 : 2840
  )

  const inboundDailyPallets = Math.max(0, simInput?.inboundDailyPallets ?? 500)
  const outboundDailyPallets = Math.max(0, simInput?.outboundDailyPallets ?? 500)
  const totalDailyPallets = inboundDailyPallets + outboundDailyPallets
  const storageTypesInUse = simInput?.storageTypesInUse ?? ['rack']
  const useRack = storageTypesInUse.includes('rack')
  const useGround = storageTypesInUse.includes('ground_storage') || storageTypesInUse.includes('ground_stacking')
  const requestedRack = Math.max(0, simInput?.rackDailyPallets ?? 500)
  const requestedStack = Math.max(0, totalDailyPallets)
  const effectiveRequestedRack = useRack ? requestedRack : 0
  const effectiveRequestedStack = useGround ? requestedStack : 0
  const scale = effectiveRequestedRack + effectiveRequestedStack > totalDailyPallets
    ? totalDailyPallets / (effectiveRequestedRack + effectiveRequestedStack)
    : 1
  const rackDaily = Math.round(effectiveRequestedRack * scale)
  const stackDaily = Math.round(effectiveRequestedStack * scale)
  const xplDaily = Math.max(0, totalDailyPallets - rackDaily - stackDaily)

  const xplPct = totalDailyPallets > 0 ? (xplDaily / totalDailyPallets) * 100 : 0
  let xqeRackPct = totalDailyPallets > 0 ? (rackDaily / totalDailyPallets) * 100 : 0
  let xqeStackPct = totalDailyPallets > 0 ? (stackDaily / totalDailyPallets) * 100 : 0
  if (useRack && !useGround) {
    xqeRackPct = 100 - xplPct
    xqeStackPct = 0
  } else if (!useRack && useGround) {
    xqeRackPct = 0
    xqeStackPct = 100 - xplPct
  } else if (!useRack && !useGround) {
    xqeRackPct = 0
    xqeStackPct = 0
  }
  const rackVehicleType = rackMode === 'XNA' ? 'XNA_121' : 'XQE_122'
  const turnNodeCount = graph.nodes.filter((n) => n.kind === 'turn').length
  const configuredIntersections = simInput?.intersectionCount ?? 0
  const effectiveIntersectionCount = Math.max(configuredIntersections, turnNodeCount)

  return {
    AGV_Specifications: {
      XQE_122: {
        forward_speed_ms: 1.0,
        reverse_speed_ms: 0.3,
        lift_speed_ms: 0.2,
        max_lift_height_mm: Math.max(4500, simInput?.rackHeightMm ?? 4500),
        pickup_time_s: 30,
        dropoff_time_s: 30,
      },
      XPL_201: {
        forward_speed_ms: 1.5,
        reverse_speed_ms: 0.5,
        pickup_time_s: 30,
        dropoff_time_s: 30,
      },
      XNA_121: {
        forward_speed_ms: 1.0,
        reverse_speed_ms: 1.0,
        lift_speed_ms: 0.2,
        max_lift_height_mm: Math.max(8500, simInput?.rackHeightMm ?? 8500),
        pickup_time_s: 30,
        dropoff_time_s: 30,
      },
      Turn_90_degrees_s: 10,
    },
    Warehouse_Layout: {
      Distances_mm: {
        Rest_to_Inbound: restToInboundMm,
        Rest_to_Head_Aisle: restToHeadAisleMm,
        Head_Aisle_to_Handover: headAisleToHandoverMm,
        Head_Aisle_to_Rack_Aisle: headAisleToRackAisleMm,
        Rack_Aisle_Length: rackAisleLengthMm,
        Head_Aisle_to_Stacking: 10000,
        Head_Aisle_to_Outbound: headAisleToOutboundMm,
        Inbound_Depth_mm: 2000,
        Rest_to_Production: restToInboundMm,
        Production_to_Storage_Entry: headAisleToRackAisleMm,
      },
      Aisle_Widths_mm: {
        Inbound_Access_Width_mm: headAisleWidthMm,
        Head_Aisle_Width_mm: headAisleWidthMm,
        Outbound_Access_Width_mm: headAisleWidthMm,
        Rack_Aisle_Width_mm: rackAisleWidthMm,
      },
    },
    Rack_Configuration: {
      Rack_Length_mm: rackAisleLengthMm,
      Rack_Height_mm: simInput?.rackHeightMm ?? ((simInput?.rackLevels ?? 3) * (simInput?.shelfHeightSpacingMm ?? 1300)),
      Pallet_Width_mm: 800,
      Shelf_Height_Spacing_mm: simInput?.shelfHeightSpacingMm ?? 1300,
      Position_Spacing_mm: simInput?.positionSpacingMm ?? 950,
      Aisles: geometry.aisleCount,
      Levels: simInput?.rackLevels ?? 3,
    },
    Ground_Stacking_Configuration: {
      Box_Dimensions: {
        Length_mm: 1200,
        Width_mm: 800,
        Height_mm: 1000,
      },
      Storage_Area_Dimensions: {
        Length_mm: 15000,
        Width_mm: 10000,
      },
      Fork_Entry_Side: 'Length',
      Clearance_mm: 200,
      Rows: simInput?.stackingRows ?? 10,
      Columns: simInput?.stackingColumns ?? 12,
      Levels: simInput?.stackingLevels ?? 3,
    },
    Throughput_Configuration: {
      Total_Daily_Pallets: totalDailyPallets,
      Total_Daily_Inbound_Pallets: inboundDailyPallets,
      Total_Daily_Outbound_Pallets: outboundDailyPallets,
      Operating_Hours: simInput?.operatingHours ?? 16,
      XPL_201_Percentage: xplPct,
      XQE_Rack_Percentage: xqeRackPct,
      XQE_Stacking_Percentage: xqeStackPct,
      Utilization_Target: simInput?.utilizationTarget ?? 0.75,
      Buffer_Capacity_Pallets: 50,
    },
    Block_Storage_Policy: {
      strategy: simInput?.blockStoragePolicy ?? 'lane_sequence',
    },
    Traffic_Control: {
      Enabled: simInput?.trafficControlEnabled ?? false,
      Intersections: {
        Count: effectiveIntersectionCount,
        Cycle_Time_s: simInput?.intersectionCycleTimeS ?? 30,
        Priority_Split: {
          Main: geometry.inboundPriorityShare,
          Side: geometry.outboundPriorityShare,
        },
      },
    },
    Generated_From_Graph: {
        rack_mode: rackMode,
        rack_vehicle_type: rackVehicleType,
        storage_types_in_use: storageTypesInUse,
        force_explicit_handover: simInput?.forceExplicitHandover ?? false,
        throughput_daily: {
          total: totalDailyPallets,
          inbound: inboundDailyPallets,
          outbound: outboundDailyPallets,
          rack: rackDaily,
          stacking: stackDaily,
          handover: xplDaily,
        },
        turn_node_count: turnNodeCount,
        effective_intersection_count: effectiveIntersectionCount,
      derived: {
        aisle_count: geometry.aisleCount,
        source_to_handover_median_m: geometry.sourceToHandoverM,
        source_to_outbound_median_m: geometry.sourceToOutboundM,
        handover_to_rack_median_m: geometry.handoverToRackM,
        rack_length_median_m: geometry.rackLengthM,
        non_rack_width_median_m: geometry.nonRackWidthM,
        rack_width_median_m: geometry.rackWidthM,
        inbound_priority_share: geometry.inboundPriorityShare,
        outbound_priority_share: geometry.outboundPriorityShare,
      },
      notes: [
        'Business inputs (throughput split, stacking dimensions, AGV operational times) use defaults and should be tuned.',
        'Distances and widths are inferred from graph topology and edge properties where possible.',
      ],
    },
  }
}
