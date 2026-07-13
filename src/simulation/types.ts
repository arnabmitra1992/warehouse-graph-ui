export interface SimEdge {
  id: string
  source: string
  target: string
  length: number
  widthM: number
  preset: string
  aisleId?: number
}

export interface SimNode {
  id: string
  kind: string
  aisleId?: number
  storageType?: 'rack' | 'ground_storage' | 'ground_stacking'
  blockRows?: number
  blockColumns?: number
  blockLevels?: number
  boxLengthMm?: number
  boxWidthMm?: number
  clearanceMm?: number
}

export interface SimGraph {
  nodes: SimNode[]
  edges: SimEdge[]
}

export interface PathResult {
  nodeIds: string[]
  edgeIds: string[]
  distanceM: number
  travelTimeS: number
}

export interface AisleResult {
  aisleId: number
  distanceToHandover: number
  branch: 'XQE' | 'XPL' | 'unknown'
  handoverNodeId?: string
  assignedTasks?: number
  storageNodeIds?: string[]
  handoverPath?: PathResult
  rackPath?: PathResult
  error?: string
}

export interface SimResult {
  aisles: AisleResult[]
  workloadBuckets?: {
    horizontal_xpl: number
    horizontal_xqe: number
    stacking_xqe: number
    horizontal_xpl_inbound: number
    horizontal_xpl_outbound: number
    horizontal_xqe_inbound: number
    horizontal_xqe_outbound: number
    stacking_xqe_inbound: number
    stacking_xqe_outbound: number
  }
  storageTaskBreakdown?: Array<{
    storageNodeId: string
    tasksPerDay: number
    inboundTasksPerDay: number
    outboundTasksPerDay: number
    aisleId?: number
    handoverNodeId?: string
    inboundHandoverNodeId?: string
    outboundHandoverNodeId?: string
    storageMode?: 'rack' | 'ground_storage' | 'ground_stacking'
    blockRows?: number
    blockColumns?: number
    blockLevels?: number
    boxLengthMm?: number
    boxWidthMm?: number
    clearanceMm?: number
    storageCapacity?: number
    inboundBranch: string
    outboundBranch: string
    inboundStorageSideBranch?: string
    outboundStorageSideBranch?: string
  }>
  diagnostics?: {
    excludedStorages: Array<{
      storageNodeId: string
      reason: string
    }>
  }
}
