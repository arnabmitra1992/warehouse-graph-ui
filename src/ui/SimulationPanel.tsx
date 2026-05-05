import { useStore } from '../store'
import { runSimulation } from '../simulation'
import { compileGraph } from '../simulation/compiler'
import type { AisleResult } from '../simulation/types'

export function SimulationPanel() {
  const { nodes, edges, settings, issues, simResult, setSimResult, setHighlighted } = useStore()

  const hasErrors = issues.some((i) => i.severity === 'error')

  const handleRun = () => {
    const graph = compileGraph(nodes, edges, settings)
    const result = runSimulation(graph)
    setSimResult(result)
  }

  const handleRowClick = (aisle: AisleResult) => {
    const nodeIds = [
      ...(aisle.handoverPath?.nodeIds ?? []),
      ...(aisle.rackPath?.nodeIds ?? []),
      ...(aisle.outboundPath?.nodeIds ?? []),
    ]
    const edgeIds = [
      ...(aisle.handoverPath?.edgeIds ?? []),
      ...(aisle.rackPath?.edgeIds ?? []),
      ...(aisle.outboundPath?.edgeIds ?? []),
    ]
    setHighlighted([...new Set(nodeIds)], [...new Set(edgeIds)])
  }

  const handleClearHighlight = () => {
    setHighlighted([], [])
  }

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
          title={hasErrors ? 'Fix all validation errors before running simulation' : 'Run simulation'}
        >
          ▶ Run Simulation
        </button>
        {hasErrors && (
          <span className="text-xs text-red-400">Fix validation errors first</span>
        )}
        {simResult && (
          <button
            onClick={handleClearHighlight}
            className="ml-auto px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Clear Highlight
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        {!simResult ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-500">
            Run simulation to see results.
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
                <th className="px-3 py-1.5 text-left">Inbound (m)</th>
                <th className="px-3 py-1.5 text-left">Inbound (s)</th>
                <th className="px-3 py-1.5 text-left">Storage (m)</th>
                <th className="px-3 py-1.5 text-left">Storage (s)</th>
                <th className="px-3 py-1.5 text-left">Outbound (m)</th>
                <th className="px-3 py-1.5 text-left">Outbound (s)</th>
                <th className="px-3 py-1.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {simResult.aisles.map((aisle) => (
                <tr
                  key={aisle.aisleId}
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
                  <td className="px-3 py-1.5 font-mono">
                    {aisle.outboundPath ? aisle.outboundPath.distanceM.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {aisle.outboundPath ? aisle.outboundPath.travelTimeS.toFixed(1) : '—'}
                  </td>
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
