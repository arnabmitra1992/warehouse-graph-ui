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
  handoverPath?: PathResult
  rackPath?: PathResult
  outboundPath?: PathResult
  error?: string
}

export interface SimResult {
  aisles: AisleResult[]
}
