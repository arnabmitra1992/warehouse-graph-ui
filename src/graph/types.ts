export interface NodeData {
  kind: 'source_gate' | 'outbound_gate' | 'handover' | 'rack_aisle' | 'bulk_storage' | 'turn'
  label?: string
  aisleId?: number
  /** rack_aisle properties */
  rackLengthM?: number
  rackHeightM?: number
  levels?: number
  bays?: number
  depth?: number
  /** bulk_storage properties */
  capacityM3?: number
  areaM2?: number
}

export interface EdgeData {
  preset: 'rack_aisle' | 'head_aisle' | 'corridor' | 'connector'
  aisleId?: number
  widthM: number
  lengthMode: 'auto' | 'manual'
  lengthMManual?: number
  priorityStream?: string
  intersections?: number
}

export interface AppSettings {
  metersPerPixel: number
}
