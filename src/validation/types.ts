export type Severity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  code: string
  severity: Severity
  message: string
  nodeIds?: string[]
  edgeIds?: string[]
}
