import { useState } from 'react'
import { useStore } from '../store'
import { runSimulation } from '../simulation'
import { compileGraph } from '../simulation/compiler'
import type { AisleResult } from '../simulation/types'
import { compileSimulatorConfig } from '../integration/simulatorConfig'

function normalizeReportText(raw: string): string {
  return raw
    .replaceAll('XPL_201 HANDOVER WORKFLOW', 'XPL_201 HORIZONTAL TRANSPORT (SG → HANDOVER)')
    .replaceAll('XQE_122 RACK STORAGE WORKFLOW', 'XQE_122 STORAGE LEG (HANDOVER → STORAGE)')
    .replaceAll('XQE_122 GROUND STACKING WORKFLOW', 'XQE_122 GROUND STORAGE / STACKING LEG')
}

interface BackendSimulationResponse {
  ok: boolean
  result?: {
    cycle_times_s?: {
      xpl201_handover?: number
      xqe122_rack_avg?: number
      xqe122_stack_avg?: number
    }
    fleet_sizes?: {
      xpl201?: number
      xqe122_rack?: number
      xqe122_stacking?: number
      rack_vehicle_type?: string
      total?: number
      dispatch_total?: number
      dispatch_throughput_check?: {
        all_targets_met?: boolean
      }
      workload_buckets?: {
        horizontal_xpl?: number
        horizontal_xqe?: number
        stacking_xqe?: number
        horizontal_xpl_inbound?: number
        horizontal_xpl_outbound?: number
        horizontal_xqe_inbound?: number
        horizontal_xqe_outbound?: number
        stacking_xqe_inbound?: number
        stacking_xqe_outbound?: number
      }
    }
    outbound_workflow?: {
      block_storage_policy?: string
      inbound_cycle_s?: number
      outbound_cycle_s?: number
      shuffling_cycle_s?: number
      total_outbound_fleet?: number
    }
  }
  report?: string
  traffic?: {
    enabled: boolean
    inbound_wait_overhead_s: number
    outbound_wait_overhead_s: number
    bottleneck?: { name?: string | null; utilization?: number | null }
    aisles: Array<{
      name: string
      width_mm: number
      capacity: number
      utilization: number
      avg_wait_time_s: number
      arrival_rate_per_hour: number
    }>
  } | null
  error?: string
}

export function SimulationPanel() {
  const { nodes, edges, settings, issues, simResult, setSimResult, setHighlighted } = useStore()
  const [backendLoading, setBackendLoading] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [backendResult, setBackendResult] = useState<BackendSimulationResponse['result'] | null>(null)
  const [backendReport, setBackendReport] = useState<string>('')
  const [trafficResult, setTrafficResult] = useState<BackendSimulationResponse['traffic'] | null>(null)
  const [rackVehicleType, setRackVehicleType] = useState<'XNA_121' | 'XQE_122'>('XQE_122')

  const hasErrors = issues.some((i) => i.severity === 'error')

  const handleRun = () => {
    const graph = compileGraph(nodes, edges, settings)
    const result = runSimulation(graph, settings)
    setSimResult(result)
  }

  const handleRowClick = (aisle: AisleResult) => {
    const nodeIds = [
      ...(aisle.handoverPath?.nodeIds ?? []),
      ...(aisle.rackPath?.nodeIds ?? []),
    ]
    const edgeIds = [
      ...(aisle.handoverPath?.edgeIds ?? []),
      ...(aisle.rackPath?.edgeIds ?? []),
    ]
    setHighlighted([...new Set(nodeIds)], [...new Set(edgeIds)])
  }

  const handleClearHighlight = () => {
    setHighlighted([], [])
  }

  const handleRunBackend = async () => {
    setBackendLoading(true)
    setBackendError(null)
    setBackendResult(null)
    setBackendReport('')
    setTrafficResult(null)
    setRackVehicleType('XQE_122')

    try {
      const graph = compileGraph(nodes, edges, settings)
      const localResult = runSimulation(graph, settings)
      const breakdown = localResult.storageTaskBreakdown ?? []
      const horizontalXpl = breakdown.reduce((s, a) => s + (a.branch === 'XPL' ? a.tasksPerDay : 0), 0)
      const horizontalXqe = breakdown.reduce((s, a) => s + (a.branch === 'XQE' ? a.tasksPerDay : 0), 0)
      const stackingXqe = breakdown.reduce((s, a) => s + a.tasksPerDay, 0)
      const config = compileSimulatorConfig(graph, settings)
      const rv = ((config as { Generated_From_Graph?: { rack_vehicle_type?: 'XNA_121' | 'XQE_122' } })
        .Generated_From_Graph?.rack_vehicle_type) ?? 'XQE_122'
      setRackVehicleType(rv)
      const response = await fetch('http://127.0.0.1:8000/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          traffic_control: settings.simulator.trafficControlEnabled,
          workload_buckets: {
            horizontal_xpl: horizontalXpl,
            horizontal_xqe: horizontalXqe,
            stacking_xqe: stackingXqe,
          },
        }),
      })
      const body = (await response.json()) as BackendSimulationResponse
      if (!response.ok || !body.ok) {
        throw new Error(body.error || `Backend error (${response.status})`)
      }
      setBackendResult(body.result ?? null)
      if (body.result?.fleet_sizes?.rack_vehicle_type) {
        setRackVehicleType(body.result.fleet_sizes.rack_vehicle_type as 'XNA_121' | 'XQE_122')
      }
      setBackendReport(normalizeReportText(body.report ?? ''))
      setTrafficResult(body.traffic ?? null)
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : String(err))
    } finally {
      setBackendLoading(false)
    }
  }

  const handleExportResultsPdf = () => {
    const reportLines: string[] = []
    reportLines.push('Warehouse Simulation Results')
    reportLines.push(`Generated: ${new Date().toLocaleString()}`)
    reportLines.push('')
    if (backendResult) {
      reportLines.push('Backend Result')
      reportLines.push(`Fleet Total: ${fleet?.total ?? 0}`)
      reportLines.push(`XPL Fleet: ${fleet?.xpl201 ?? 0}`)
      reportLines.push(`Rack Fleet: ${fleet?.xqe122_rack ?? 0}`)
      reportLines.push(`Stack Fleet: ${fleet?.xqe122_stacking ?? 0}`)
      reportLines.push(`XPL Cycle (s): ${cycles?.xpl201_handover?.toFixed(1) ?? '0.0'}`)
      reportLines.push(`Rack Cycle (s): ${cycles?.xqe122_rack_avg?.toFixed(1) ?? '0.0'}`)
      reportLines.push(`Stack Cycle (s): ${cycles?.xqe122_stack_avg?.toFixed(1) ?? '0.0'}`)
      reportLines.push('')
    }
    if (trafficResult) {
      reportLines.push('Traffic / Queue')
      reportLines.push(`Traffic Enabled: ${trafficResult.enabled ? 'yes' : 'no'}`)
      reportLines.push(`Inbound Wait (s): ${trafficResult.inbound_wait_overhead_s.toFixed(1)}`)
      reportLines.push(`Outbound Wait (s): ${trafficResult.outbound_wait_overhead_s.toFixed(1)}`)
      reportLines.push(`Bottleneck: ${trafficResult.bottleneck?.name ?? '—'}`)
      reportLines.push('')
    }

    const html = `
      <html>
        <head><title>Simulation Results</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px; white-space: pre-wrap;">${reportLines.join('\n')}</body>
      </html>
    `
    const popup = window.open('', '_blank', 'width=900,height=700')
    if (!popup) return
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  const localShown = !!simResult && simResult.aisles.length > 0
  const localXplHorizontalTasks = simResult?.storageTaskBreakdown?.reduce((s, a) => s + (a.branch === 'XPL' ? a.tasksPerDay : 0), 0) ?? 0
  const localXqeHorizontalTasks = simResult?.storageTaskBreakdown?.reduce((s, a) => s + (a.branch === 'XQE' ? a.tasksPerDay : 0), 0) ?? 0
  const localXqeStackingTasks = simResult?.storageTaskBreakdown?.reduce((s, a) => s + a.tasksPerDay, 0) ?? 0
  const fleet = backendResult?.fleet_sizes
  const cycles = backendResult?.cycle_times_s
  const outbound = backendResult?.outbound_workflow
  const useRack = settings.simulator.storageTypesInUse.includes('rack')
  const useGround = settings.simulator.storageTypesInUse.includes('ground_storage') || settings.simulator.storageTypesInUse.includes('ground_stacking')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-900 border-b border-gray-700 shrink-0">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wide">Simulation</h2>
        <button
          onClick={handleRun}
          disabled={hasErrors}
          className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
            hasErrors
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
          }`}
          title={hasErrors ? 'Fix all validation errors before running simulation' : 'Run local dispatch preview'}
        >
          ▶ Run Local Dispatch
        </button>
        <button
          onClick={handleRunBackend}
          disabled={hasErrors || backendLoading}
          className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
            hasErrors || backendLoading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
          }`}
          title={hasErrors ? 'Fix all validation errors before running simulation' : 'Run backend AGV fleet sizing'}
        >
          {backendLoading ? '… Running Backend' : '▶ Run Backend Fleet Sizing'}
        </button>
        {hasErrors && (
          <span className="text-xs text-red-400">Fix validation errors first</span>
        )}
        {(backendResult || backendReport) && (
          <button
            onClick={handleExportResultsPdf}
            className="px-3 py-1 rounded text-xs font-bold bg-purple-700 hover:bg-purple-600 text-white transition-colors"
            title="Open printable view to save as PDF"
          >
            Export Results PDF
          </button>
        )}
        {localShown && (
          <button
            onClick={handleClearHighlight}
            className="ml-auto px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Clear Highlight
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        {backendError && (
          <div className="px-3 py-2 text-xs text-red-300 bg-red-900/30 border-b border-red-800">
            Backend simulation failed: {backendError}
          </div>
        )}
        {backendResult && (
          <div className="px-3 py-2 border-b border-gray-700 bg-gray-800 text-xs text-gray-200">
            <div className="font-semibold text-gray-300 mb-1">Backend Simulator Result</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">Fleet Total: {fleet?.total ?? 0}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XPL Fleet: {fleet?.xpl201 ?? 0}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XQE Rack Fleet: {fleet?.xqe122_rack ?? 0}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XQE Stack Fleet: {fleet?.xqe122_stacking ?? 0}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XPL Cycle (s): {cycles?.xpl201_handover?.toFixed(1) ?? '0.0'}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">
                {!useRack
                  ? 'Rack Cycle (s): —'
                  : `XQE Rack Cycle (s): ${cycles?.xqe122_rack_avg?.toFixed(1) ?? '0.0'}`}
              </div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">
                {!useGround
                  ? 'Stack Cycle (s): —'
                  : `XQE Stack Cycle (s): ${cycles?.xqe122_stack_avg?.toFixed(1) ?? '0.0'}`}
              </div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">Block Policy: {outbound?.block_storage_policy ?? '—'}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">AGV XPL_201: {fleet?.xpl201 ?? 0}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">AGV {rackVehicleType} (Rack): {fleet?.xqe122_rack ?? 0}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">AGV XQE_122 (Stack): {fleet?.xqe122_stacking ?? 0}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">Dispatch Fleet Total: {fleet?.dispatch_total ?? fleet?.total ?? 0}</div>
            </div>
            {fleet?.workload_buckets && (
              <div className="mt-2">
                <div className="font-semibold text-gray-300 mb-1">Backend Workload Buckets (tasks/day)</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XPL Horizontal: {Math.round(fleet.workload_buckets.horizontal_xpl ?? 0)}</div>
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XQE Horizontal: {Math.round(fleet.workload_buckets.horizontal_xqe ?? 0)}</div>
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XQE Stacking: {Math.round(fleet.workload_buckets.stacking_xqe ?? 0)}</div>
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XPL Inbound/Outbound: {Math.round(fleet.workload_buckets.horizontal_xpl_inbound ?? 0)} / {Math.round(fleet.workload_buckets.horizontal_xpl_outbound ?? 0)}</div>
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XQE Inbound/Outbound: {Math.round(fleet.workload_buckets.horizontal_xqe_inbound ?? 0)} / {Math.round(fleet.workload_buckets.horizontal_xqe_outbound ?? 0)}</div>
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">Stack Inbound/Outbound: {Math.round(fleet.workload_buckets.stacking_xqe_inbound ?? 0)} / {Math.round(fleet.workload_buckets.stacking_xqe_outbound ?? 0)}</div>
                </div>
                <div className="mt-2 bg-gray-900 rounded px-2 py-1 border border-gray-700">
                  Throughput Check: {fleet.dispatch_throughput_check?.all_targets_met ? 'PASS' : 'FAIL'}
                </div>
              </div>
            )}
            {trafficResult && (
              <div className="mt-2">
                <div className="font-semibold text-gray-300 mb-1">Traffic / Queue Model</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">Traffic: {trafficResult.enabled ? 'on' : 'off'}</div>
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">Inbound wait (s): {trafficResult.inbound_wait_overhead_s.toFixed(1)}</div>
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">Outbound wait (s): {trafficResult.outbound_wait_overhead_s.toFixed(1)}</div>
                  <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">Bottleneck: {trafficResult.bottleneck?.name ?? '—'}</div>
                </div>
                {trafficResult.aisles.length > 0 && (
                  <table className="w-full text-[10px] mt-2 border border-gray-700">
                    <thead className="bg-gray-900 text-gray-400">
                      <tr>
                        <th className="px-2 py-1 text-left">Aisle</th>
                        <th className="px-2 py-1 text-left">Cap</th>
                        <th className="px-2 py-1 text-left">Util</th>
                        <th className="px-2 py-1 text-left">Wait(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trafficResult.aisles.map((a) => (
                        <tr key={a.name} className="border-t border-gray-700">
                          <td className="px-2 py-1">{a.name}</td>
                          <td className="px-2 py-1">{a.capacity}</td>
                          <td className="px-2 py-1">{a.utilization.toFixed(2)}</td>
                          <td className="px-2 py-1">{a.avg_wait_time_s.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {/* metrics-only view: backend text workflow report hidden */}
          </div>
        )}
        {localShown && (
          <div className="px-3 py-2 border-b border-gray-700 bg-gray-800 text-xs text-gray-200">
            <div className="font-semibold text-gray-300 mb-1">Dispatch Split (from path assignment)</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XPL Horizontal Tasks/day: {localXplHorizontalTasks}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XQE Horizontal Tasks/day: {localXqeHorizontalTasks}</div>
              <div className="bg-gray-900 rounded px-2 py-1 border border-gray-700">XQE Stacking Tasks/day: {localXqeStackingTasks}</div>
            </div>
            {!!simResult?.storageTaskBreakdown?.length && (
              <table className="w-full text-[10px] mt-2 border border-gray-700">
                <thead className="bg-gray-900 text-gray-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Storage</th>
                    <th className="px-2 py-1 text-left">Aisle</th>
                    <th className="px-2 py-1 text-left">Branch</th>
                    <th className="px-2 py-1 text-left">Handover</th>
                    <th className="px-2 py-1 text-left">Tasks/day</th>
                  </tr>
                </thead>
                <tbody>
                  {simResult.storageTaskBreakdown.map((s) => (
                    <tr key={s.storageNodeId} className="border-t border-gray-700">
                      <td className="px-2 py-1 font-mono">{s.storageNodeId}</td>
                      <td className="px-2 py-1">#{s.aisleId ?? '—'}</td>
                      <td className="px-2 py-1">{s.branch}</td>
                      <td className="px-2 py-1 font-mono">{s.handoverNodeId ?? '—'}</td>
                      <td className="px-2 py-1 font-mono">{s.tasksPerDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!!simResult?.diagnostics?.excludedStorages?.length && (
              <div className="mt-2">
                <div className="font-semibold text-gray-300 mb-1">Diagnostics: Excluded Storages</div>
                <table className="w-full text-[10px] border border-gray-700">
                  <thead className="bg-gray-900 text-gray-400">
                    <tr>
                      <th className="px-2 py-1 text-left">Storage</th>
                      <th className="px-2 py-1 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simResult.diagnostics.excludedStorages.map((d) => (
                      <tr key={`${d.storageNodeId}-${d.reason}`} className="border-t border-gray-700">
                        <td className="px-2 py-1 font-mono">{d.storageNodeId}</td>
                        <td className="px-2 py-1">{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {!simResult ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-500">
            Run local or backend simulation to see results.
          </div>
        ) : simResult.aisles.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-500">
            No aisles found in graph.
          </div>
        ) : (
          <table className="w-full text-xs text-gray-200">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700 bg-gray-900">
                <th className="px-3 py-1.5 text-left">Aisle</th>
                <th className="px-3 py-1.5 text-left">Dist to HO (m)</th>
                <th className="px-3 py-1.5 text-left">Branch</th>
                <th className="px-3 py-1.5 text-left">HO path (m)</th>
                <th className="px-3 py-1.5 text-left">HO time (s)</th>
                <th className="px-3 py-1.5 text-left">Rack path (m)</th>
                <th className="px-3 py-1.5 text-left">Rack time (s)</th>
                <th className="px-3 py-1.5 text-left">Handover</th>
                <th className="px-3 py-1.5 text-left">Tasks/day</th>
                <th className="px-3 py-1.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {simResult.aisles.map((aisle) => (
                <tr
                  key={`${aisle.aisleId}-${aisle.handoverNodeId ?? 'none'}-${aisle.branch}`}
                  className="border-b border-gray-700 hover:bg-gray-700 cursor-pointer"
                  onClick={() => handleRowClick(aisle)}
                >
                  <td className="px-3 py-1.5 font-mono font-bold text-yellow-300">#{aisle.aisleId}</td>
                  <td className="px-3 py-1.5 font-mono">{aisle.distanceToHandover.toFixed(1)}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        aisle.branch === 'XQE'
                          ? 'bg-blue-700 text-blue-200'
                          : aisle.branch === 'XPL'
                          ? 'bg-purple-700 text-purple-200'
                          : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      {aisle.branch}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {aisle.handoverPath ? aisle.handoverPath.distanceM.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {aisle.handoverPath ? aisle.handoverPath.travelTimeS.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {aisle.rackPath ? aisle.rackPath.distanceM.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {aisle.rackPath ? aisle.rackPath.travelTimeS.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{aisle.handoverNodeId ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono">{aisle.assignedTasks ?? 0}</td>
                  <td className="px-3 py-1.5">
                    {aisle.error ? (
                      <span className="text-red-400 text-[10px]">{aisle.error}</span>
                    ) : (
                      <span className="text-green-400 text-[10px]">✓ OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
