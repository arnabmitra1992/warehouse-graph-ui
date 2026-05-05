import { useStore } from '../store'
import type { ValidationIssue } from '../validation/types'

const SEVERITY_COLORS: Record<string, string> = {
  error: 'bg-red-600',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
}

const SEVERITY_TEXT: Record<string, string> = {
  error: 'ERROR',
  warning: 'WARN',
  info: 'INFO',
}

export function IssuesPanel() {
  const { issues, setSelectedNode, setSelectedEdge, setHighlighted } = useStore()

  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  const infos = issues.filter((i) => i.severity === 'info')

  const handleIssueClick = (issue: ValidationIssue) => {
    setHighlighted(issue.nodeIds ?? [], issue.edgeIds ?? [])
    if (issue.nodeIds?.[0]) setSelectedNode(issue.nodeIds[0])
    else if (issue.edgeIds?.[0]) setSelectedEdge(issue.edgeIds[0])
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-900 border-b border-gray-700 shrink-0">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wide">Validation Issues</h2>
        <span className="text-xs text-red-400">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        <span className="text-xs text-yellow-400">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>
        {infos.length > 0 && <span className="text-xs text-blue-400">{infos.length} info</span>}
      </div>
      <div className="flex-1 overflow-y-auto">
        {issues.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-green-400">
            ✓ No issues — graph is valid
          </div>
        ) : (
          <ul className="divide-y divide-gray-700">
            {issues.map((issue, i) => (
              <li
                key={i}
                className="flex gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer"
                onClick={() => handleIssueClick(issue)}
              >
                <span
                  className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${
                    SEVERITY_COLORS[issue.severity] ?? 'bg-gray-600'
                  }`}
                >
                  {SEVERITY_TEXT[issue.severity] ?? issue.severity.toUpperCase()}
                </span>
                <span className="text-[11px] text-gray-200 leading-relaxed">
                  <span className="text-gray-400 font-mono">[{issue.code}]</span>{' '}
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
