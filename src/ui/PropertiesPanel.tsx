import { useStore } from '../store'
import type { NodeData, EdgeData, AppSettings, SimulatorInputs } from '../graph/types'
import { getEdgeLength } from '../graph/utils'

export function PropertiesPanel() {
  const {
    nodes,
    edges,
    settings,
    updateSettings,
    selectedNodeId,
    selectedEdgeId,
    setSelectedNode,
    setSelectedEdge,
    removeNode,
    removeEdge,
    updateNodeData,
    updateEdgeData,
  } = useStore()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId)

  return (
    <div className="w-[280px] bg-gray-800 text-white p-4 border-l border-gray-700 flex flex-col gap-3 overflow-y-auto">
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Properties</h2>

      <SimulatorInputs
        settings={settings}
        onUpdate={(simulator) => updateSettings({ simulator })}
      />

      {selectedNode && (
        <NodeProperties
          id={selectedNode.id}
          data={selectedNode.data as NodeData}
          onUpdate={(data) => updateNodeData(selectedNode.id, data)}
          onDelete={() => {
            removeNode(selectedNode.id)
            setSelectedNode(null)
          }}
        />
      )}

      {selectedEdge && (
        <EdgeProperties
          id={selectedEdge.id}
          data={(selectedEdge.data ?? {
            preset: 'connector',
            widthM: 3.0,
            lengthMode: 'auto',
            priorityStream: 'shared',
          }) as EdgeData}
          onUpdate={(data) => updateEdgeData(selectedEdge.id, data)}
          computedLengthM={getEdgeLength(selectedEdge as any, nodes as any, settings.metersPerPixel)}
          onDelete={() => {
            removeEdge(selectedEdge.id)
            setSelectedEdge(null)
          }}
        />
      )}

      {!selectedNode && !selectedEdge && (
        <p className="text-xs text-gray-500">Select a node or edge to edit local graph properties.</p>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      {children}
    </div>
  )
}

function inputCls() {
  return 'bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-400'
}

function NodeProperties({
  id,
  data,
  onUpdate,
  onDelete,
}: {
  id: string
  data: NodeData
  onUpdate: (d: Partial<NodeData>) => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-gray-400 font-mono truncate">ID: {id}</div>
      <Field label="Kind">
        <div className="text-sm font-semibold text-yellow-300">{data.kind}</div>
      </Field>
      <Field label="Label">
        <input
          className={inputCls()}
          value={data.label ?? ''}
          placeholder="Optional label"
          onChange={(e) => onUpdate({ label: e.target.value || undefined })}
        />
      </Field>
      {(data.kind === 'handover' || data.kind === 'rack_aisle') && (
        <Field label="Aisle ID *">
          <input
            className={inputCls()}
            type="number"
            min={1}
            value={data.aisleId ?? ''}
            placeholder="e.g. 1"
            onChange={(e) =>
              onUpdate({ aisleId: e.target.value ? parseInt(e.target.value) : undefined })
            }
          />
        </Field>
      )}
      {(data.kind === 'rack_aisle' || data.kind === 'ground_storage') && (
        <Field label="Storage Type">
          <select
            className={inputCls()}
            value={data.storageType ?? (data.kind === 'rack_aisle' ? 'rack' : 'ground_storage')}
            onChange={(e) => onUpdate({ storageType: e.target.value as NodeData['storageType'] })}
          >
            <option value="rack">rack</option>
            <option value="ground_storage">ground_storage</option>
            <option value="ground_stacking">ground_stacking</option>
          </select>
        </Field>
      )}
      <button onClick={onDelete} className="text-xs bg-red-700 hover:bg-red-600 rounded px-2 py-1 self-start">
        Delete Node
      </button>
    </div>
  )
}

function SimulatorInputs({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (d: SimulatorInputs) => void
}) {
  const sim = settings.simulator
  const inbound = Number.isFinite(sim.inboundDailyPallets) ? sim.inboundDailyPallets : 0
  const outbound = Number.isFinite(sim.outboundDailyPallets) ? sim.outboundDailyPallets : 0
  return (
    <div className="flex flex-col gap-3 border border-gray-700 rounded p-2">
      <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Simulator Inputs</div>
      <Field label="Storage Types In Use">
        <div className="flex flex-col gap-1 text-xs">
          {(['rack', 'ground_storage', 'ground_stacking'] as const).map((t) => {
            const checked = sim.storageTypesInUse.includes(t)
            return (
              <label key={t} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...sim.storageTypesInUse, t]
                      : sim.storageTypesInUse.filter((x) => x !== t)
                    onUpdate({ ...sim, storageTypesInUse: next.length > 0 ? next : ['rack'] })
                  }}
                />
                <span>{t}</span>
              </label>
            )
          })}
        </div>
      </Field>
      <Field label="Inbound Pallets / day">
        <input className={inputCls()} type="number" min={0} value={inbound}
          onChange={(e) => onUpdate({ ...sim, inboundDailyPallets: parseInt(e.target.value || '0', 10) || 0 })} />
      </Field>
      <Field label="Outbound Pallets / day">
        <input className={inputCls()} type="number" min={0} value={outbound}
          onChange={(e) => onUpdate({ ...sim, outboundDailyPallets: parseInt(e.target.value || '0', 10) || 0 })} />
      </Field>
      <Field label="Total Stack + Destack / day">
        <div className="text-xs text-gray-300">{inbound + outbound}</div>
      </Field>
      <Field label="Operating Hours">
        <input className={inputCls()} type="number" min={1} step={0.5} value={sim.operatingHours}
          onChange={(e) => onUpdate({ ...sim, operatingHours: parseFloat(e.target.value || '0') || 1 })} />
      </Field>
      <Field label="Utilization Target (0-1)">
        <input className={inputCls()} type="number" min={0.1} max={1} step={0.01} value={sim.utilizationTarget}
          onChange={(e) => onUpdate({ ...sim, utilizationTarget: Math.max(0.1, Math.min(1, parseFloat(e.target.value || '0.75') || 0.75)) })} />
      </Field>
      {sim.storageTypesInUse.includes('rack') && (
      <Field label="Rack Daily Pallets">
        <input className={inputCls()} type="number" min={0} value={sim.rackDailyPallets}
          onChange={(e) => onUpdate({ ...sim, rackDailyPallets: parseInt(e.target.value || '0', 10) || 0 })} />
      </Field>
      )}
      {(sim.storageTypesInUse.includes('ground_storage') || sim.storageTypesInUse.includes('ground_stacking')) && (
      <Field label="Stacking + Destacking Tasks/day">
        <div className="text-xs text-gray-300">{inbound + outbound}</div>
      </Field>
      )}
      {sim.storageTypesInUse.includes('rack') && (
      <>
        <Field label="Rack Levels">
          <input className={inputCls()} type="number" min={1} value={sim.rackLevels}
            onChange={(e) => onUpdate({ ...sim, rackLevels: parseInt(e.target.value || '0', 10) || 1 })} />
        </Field>
        <Field label="Shelf Spacing (mm)">
          <input className={inputCls()} type="number" min={100} value={sim.shelfHeightSpacingMm}
            onChange={(e) => onUpdate({ ...sim, shelfHeightSpacingMm: parseInt(e.target.value || '0', 10) || 1300 })} />
        </Field>
        <Field label="Position Spacing (mm)">
          <input className={inputCls()} type="number" min={100} value={sim.positionSpacingMm}
            onChange={(e) => onUpdate({ ...sim, positionSpacingMm: parseInt(e.target.value || '0', 10) || 950 })} />
        </Field>
      </>
      )}
      {(sim.storageTypesInUse.includes('ground_storage') || sim.storageTypesInUse.includes('ground_stacking')) && (
      <Field label="Stacking Rows / Columns / Levels">
        <div className="grid grid-cols-3 gap-1">
          <input className={inputCls()} type="number" min={1} value={sim.stackingRows}
            onChange={(e) => onUpdate({ ...sim, stackingRows: parseInt(e.target.value || '0', 10) || 1 })} />
          <input className={inputCls()} type="number" min={1} value={sim.stackingColumns}
            onChange={(e) => onUpdate({ ...sim, stackingColumns: parseInt(e.target.value || '0', 10) || 1 })} />
          <input className={inputCls()} type="number" min={1} value={sim.stackingLevels}
            onChange={(e) => onUpdate({ ...sim, stackingLevels: parseInt(e.target.value || '0', 10) || 1 })} />
        </div>
      </Field>
      )}
      <Field label="Block Storage Policy">
        <select className={inputCls()} value={sim.blockStoragePolicy}
          onChange={(e) => onUpdate({ ...sim, blockStoragePolicy: e.target.value as SimulatorInputs['blockStoragePolicy'] })}>
          <option value="lane_sequence">lane_sequence</option>
          <option value="fifo">fifo</option>
          <option value="column_fifo">column_fifo</option>
        </select>
      </Field>
      <Field label="Traffic Control">
        <select className={inputCls()} value={sim.trafficControlEnabled ? 'on' : 'off'}
          onChange={(e) => onUpdate({ ...sim, trafficControlEnabled: e.target.value === 'on' })}>
          <option value="off">off</option>
          <option value="on">on</option>
        </select>
      </Field>
      <Field label="Random Seed">
        <input
          className={inputCls()}
          type="number"
          step={1}
          value={sim.randomSeed ?? ''}
          placeholder="Optional (e.g. 42)"
          onChange={(e) => {
            const parsed = Number.parseInt(e.target.value, 10)
            onUpdate({
              ...sim,
              randomSeed: e.target.value === '' || Number.isNaN(parsed) ? undefined : parsed,
            })
          }}
        />
      </Field>
      <Field label="Intersections Count">
        <input className={inputCls()} type="number" min={0} value={sim.intersectionCount}
          onChange={(e) => onUpdate({ ...sim, intersectionCount: parseInt(e.target.value || '0', 10) || 0 })} />
      </Field>
      <Field label="Intersection Cycle (s)">
        <input className={inputCls()} type="number" min={1} value={sim.intersectionCycleTimeS}
          onChange={(e) => onUpdate({ ...sim, intersectionCycleTimeS: parseFloat(e.target.value || '30') || 30 })} />
      </Field>
    </div>
  )
}

const PRESETS: EdgeData['preset'][] = ['rack_aisle', 'storage_aisle', 'head_aisle', 'corridor', 'connector']

function EdgeProperties({
  id,
  data,
  onUpdate,
  computedLengthM,
  onDelete,
}: {
  id: string
  data: EdgeData
  onUpdate: (d: Partial<EdgeData>) => void
  computedLengthM: number
  onDelete: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-gray-400 font-mono truncate">ID: {id}</div>
      <Field label="Preset">
        <select
          className={inputCls()}
          value={data.preset}
          onChange={(e) => onUpdate({ preset: e.target.value as EdgeData['preset'] })}
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      {(data.preset === 'rack_aisle' || data.preset === 'storage_aisle' || data.preset === 'head_aisle') && (
        <Field label="Aisle ID *">
          <input
            className={inputCls()}
            type="number"
            min={1}
            value={data.aisleId ?? ''}
            placeholder="e.g. 1"
            onChange={(e) =>
              onUpdate({ aisleId: e.target.value ? parseInt(e.target.value) : undefined })
            }
          />
        </Field>
      )}
      <Field label="Width (m)">
        <input
          className={inputCls()}
          type="number"
          step={0.01}
          min={0.01}
          value={data.widthM}
          onChange={(e) => onUpdate({ widthM: parseFloat(e.target.value) || 0 })}
        />
      </Field>
      <Field label="Length Mode">
        <select
          className={inputCls()}
          value={data.lengthMode}
          onChange={(e) => onUpdate({ lengthMode: e.target.value as 'auto' | 'manual' })}
        >
          <option value="auto">auto (from positions)</option>
          <option value="manual">manual</option>
        </select>
      </Field>
      <Field label="Computed Length (m)">
        <div className="text-xs text-gray-300">{computedLengthM.toFixed(2)}</div>
      </Field>
      {data.lengthMode === 'manual' && (
        <Field label="Length (m)">
          <input
            className={inputCls()}
            type="number"
            step={0.1}
            min={0.1}
            value={data.lengthMManual ?? ''}
            placeholder="e.g. 10.0"
            onChange={(e) =>
              onUpdate({ lengthMManual: e.target.value ? parseFloat(e.target.value) : undefined })
            }
          />
        </Field>
      )}
      <Field label="Priority Stream">
        <select
          className={inputCls()}
          value={data.priorityStream ?? ''}
          onChange={(e) => onUpdate({ priorityStream: (e.target.value || undefined) as EdgeData['priorityStream'] })}
        >
          <option value="">(unset)</option>
          <option value="inbound">inbound</option>
          <option value="outbound">outbound</option>
          <option value="shared">shared</option>
        </select>
      </Field>
      <Field label="Intersections">
        <input
          className={inputCls()}
          type="number"
          min={0}
          value={data.intersections ?? ''}
          placeholder="0"
          onChange={(e) =>
            onUpdate({
              intersections: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
        />
      </Field>
      <button onClick={onDelete} className="text-xs bg-red-700 hover:bg-red-600 rounded px-2 py-1 self-start">
        Delete Edge
      </button>
    </div>
  )
}
