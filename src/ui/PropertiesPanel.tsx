import { useStore } from '../store'
import type { NodeData, EdgeData } from '../graph/types'

export function PropertiesPanel() {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    updateNodeData,
    updateEdgeData,
  } = useStore()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId)

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="w-[280px] bg-gray-800 text-white p-4 border-l border-gray-700 flex flex-col gap-2">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Properties</h2>
        <p className="text-xs text-gray-500">Select a node or edge to edit its properties.</p>
      </div>
    )
  }

  return (
    <div className="w-[280px] bg-gray-800 text-white p-4 border-l border-gray-700 flex flex-col gap-3 overflow-y-auto">
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Properties</h2>

      {selectedNode && (
        <NodeProperties
          id={selectedNode.id}
          data={selectedNode.data as NodeData}
          onUpdate={(data) => updateNodeData(selectedNode.id, data)}
        />
      )}

      {selectedEdge && (
        <EdgeProperties
          id={selectedEdge.id}
          data={(selectedEdge.data ?? {
            preset: 'connector',
            widthM: 3.0,
            lengthMode: 'auto',
          }) as EdgeData}
          onUpdate={(data) => updateEdgeData(selectedEdge.id, data)}
        />
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
}: {
  id: string
  data: NodeData
  onUpdate: (d: Partial<NodeData>) => void
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
      {data.kind === 'rack_aisle' && (
        <>
          <div className="text-xs text-gray-400 font-semibold border-t border-gray-600 pt-2 mt-1">Rack Configuration</div>
          <Field label="Rack Length (m)">
            <input
              className={inputCls()}
              type="number"
              step={0.1}
              min={0.1}
              value={data.rackLengthM ?? ''}
              placeholder="e.g. 30.0"
              onChange={(e) =>
                onUpdate({ rackLengthM: e.target.value ? parseFloat(e.target.value) : undefined })
              }
            />
          </Field>
          <Field label="Rack Height (m)">
            <input
              className={inputCls()}
              type="number"
              step={0.1}
              min={0.1}
              value={data.rackHeightM ?? ''}
              placeholder="e.g. 10.0"
              onChange={(e) =>
                onUpdate({ rackHeightM: e.target.value ? parseFloat(e.target.value) : undefined })
              }
            />
          </Field>
          <Field label="Levels">
            <input
              className={inputCls()}
              type="number"
              min={1}
              step={1}
              value={data.levels ?? ''}
              placeholder="e.g. 5"
              onChange={(e) =>
                onUpdate({ levels: e.target.value ? parseInt(e.target.value) : undefined })
              }
            />
          </Field>
          <Field label="Bays (optional)">
            <input
              className={inputCls()}
              type="number"
              min={1}
              step={1}
              value={data.bays ?? ''}
              placeholder="e.g. 20"
              onChange={(e) =>
                onUpdate({ bays: e.target.value ? parseInt(e.target.value) : undefined })
              }
            />
          </Field>
          <Field label="Depth (m, optional)">
            <input
              className={inputCls()}
              type="number"
              step={0.1}
              min={0.1}
              value={data.depth ?? ''}
              placeholder="e.g. 1.1"
              onChange={(e) =>
                onUpdate({ depth: e.target.value ? parseFloat(e.target.value) : undefined })
              }
            />
          </Field>
        </>
      )}
      {data.kind === 'bulk_storage' && (
        <>
          <div className="text-xs text-gray-400 font-semibold border-t border-gray-600 pt-2 mt-1">Bulk Storage Configuration</div>
          <Field label="Capacity (m³, optional)">
            <input
              className={inputCls()}
              type="number"
              step={1}
              min={0}
              value={data.capacityM3 ?? ''}
              placeholder="e.g. 5000"
              onChange={(e) =>
                onUpdate({ capacityM3: e.target.value ? parseFloat(e.target.value) : undefined })
              }
            />
          </Field>
          <Field label="Area (m², optional)">
            <input
              className={inputCls()}
              type="number"
              step={1}
              min={0}
              value={data.areaM2 ?? ''}
              placeholder="e.g. 1000"
              onChange={(e) =>
                onUpdate({ areaM2: e.target.value ? parseFloat(e.target.value) : undefined })
              }
            />
          </Field>
        </>
      )}
    </div>
  )
}

const PRESETS: EdgeData['preset'][] = ['rack_aisle', 'head_aisle', 'corridor', 'connector']

function EdgeProperties({
  id,
  data,
  onUpdate,
}: {
  id: string
  data: EdgeData
  onUpdate: (d: Partial<EdgeData>) => void
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
      {data.preset === 'rack_aisle' && (
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
        <input
          className={inputCls()}
          value={data.priorityStream ?? ''}
          placeholder="Optional"
          onChange={(e) => onUpdate({ priorityStream: e.target.value || undefined })}
        />
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
    </div>
  )
}
