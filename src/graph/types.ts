export interface NodeData {
  kind: 'source_gate' | 'handover' | 'rack_aisle' | 'turn'
  label?: string
  aisleId?: number
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
