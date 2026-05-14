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
  storageTaskBreakdown?: Array<{
    storageNodeId: string
    tasksPerDay: number
    aisleId?: number
    handoverNodeId?: string
    branch: 'XQE' | 'XPL' | 'unknown'
  }>
  diagnostics?: {
    excludedStorages: Array<{
      storageNodeId: string
      reason: string
    }>
  }
}
