export interface NodeData {
  kind: 'source_gate' | 'handover' | 'rack_aisle' | 'turn' | 'outbound_gate' | 'ground_storage'
  label?: string
  aisleId?: number
  storageType?: 'rack' | 'ground_storage' | 'ground_stacking'
}

export interface EdgeData {
  preset: 'rack_aisle' | 'storage_aisle' | 'head_aisle' | 'corridor' | 'connector'
  aisleId?: number
  widthM: number
  lengthMode: 'auto' | 'manual'
  lengthMManual?: number
  priorityStream?: 'inbound' | 'outbound' | 'shared'
  intersections?: number
}

export interface AppSettings {
  metersPerPixel: number
  simulator: SimulatorInputs
}

export interface LayoutUnderlay {
  name: string
  mimeType: string
  dataUrl: string
  opacity: number
}

export interface SimulatorInputs {
  storageTypesInUse: Array<'rack' | 'ground_storage' | 'ground_stacking'>
  inboundDailyPallets: number
  outboundDailyPallets: number
  operatingHours: number
  utilizationTarget: number
  // Backward-compatible optional legacy fields (not primary inputs anymore)
  totalDailyPallets?: number
  rackDailyPallets: number
  stackingDailyPallets: number
  rackLevels: number
  shelfHeightSpacingMm: number
  positionSpacingMm: number
  stackingRows: number
  stackingColumns: number
  stackingLevels: number
  blockStoragePolicy: 'fifo' | 'lane_sequence' | 'column_fifo'
  trafficControlEnabled: boolean
  intersectionCount: number
  intersectionCycleTimeS: number
}
