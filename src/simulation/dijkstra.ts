export interface DijkstraEdge {
  neighbor: string
  weight: number
  edgeId: string
}

export interface DijkstraResult {
  dist: Map<string, number>
  prev: Map<string, {node: string, edgeId: string} | null>
}

export function dijkstra(
  adj: Map<string, DijkstraEdge[]>,
  start: string
): DijkstraResult {
  const dist = new Map<string, number>()
  const prev = new Map<string, {node: string, edgeId: string} | null>()
  const visited = new Set<string>()

  dist.set(start, 0)
  prev.set(start, null)

  const queue: [number, string][] = [[0, start]]

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0])
    const [d, u] = queue.shift()!
    if (visited.has(u)) continue
    visited.add(u)

    for (const {neighbor, weight, edgeId} of adj.get(u) ?? []) {
      const nd = d + weight
      if (!dist.has(neighbor) || nd < dist.get(neighbor)!) {
        dist.set(neighbor, nd)
        prev.set(neighbor, {node: u, edgeId})
        queue.push([nd, neighbor])
      }
    }
  }

  return {dist, prev}
}

export function reconstructPath(
  prev: Map<string, {node: string, edgeId: string} | null>,
  target: string
): {nodeIds: string[], edgeIds: string[]} | null {
  const nodeIds: string[] = []
  const edgeIds: string[] = []
  let current: string | null = target

  while (current != null) {
    nodeIds.unshift(current)
    const p = prev.get(current)
    if (p == null) break
    edgeIds.unshift(p.edgeId)
    current = p.node
  }

  if (nodeIds.length === 0) return null
  return {nodeIds, edgeIds}
}
