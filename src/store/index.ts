import { create } from 'zustand'
import {
  Node,
  Edge,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
} from '@xyflow/react'
import { NodeData, EdgeData, AppSettings } from '../graph/types'
import { validateGraph } from '../validation'
import { ValidationIssue } from '../validation/types'
import { SimResult } from '../simulation/types'

interface AppState {
  nodes: Node<NodeData>[]
  edges: Edge<EdgeData>[]
  settings: AppSettings
  issues: ValidationIssue[]
  simResult: SimResult | null
  selectedNodeId: string | null
  selectedEdgeId: string | null
  highlightedNodeIds: Set<string>
  highlightedEdgeIds: Set<string>

  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: Node<NodeData>) => void
  updateNodeData: (id: string, data: Partial<NodeData>) => void
  updateEdgeData: (id: string, data: Partial<EdgeData>) => void
  setSelectedNode: (id: string | null) => void
  setSelectedEdge: (id: string | null) => void
  setSimResult: (result: SimResult | null) => void
  setHighlighted: (nodeIds: string[], edgeIds: string[]) => void
  updateSettings: (settings: Partial<AppSettings>) => void
  importGraph: (nodes: Node<NodeData>[], edges: Edge<EdgeData>[], settings: AppSettings) => void
}

function runValidation(nodes: Node<NodeData>[], edges: Edge<EdgeData>[], settings: AppSettings): ValidationIssue[] {
  return validateGraph(nodes, edges, settings)
}

export const useStore = create<AppState>((set, get) => ({
  nodes: [],
  edges: [],
  settings: { metersPerPixel: 0.05 },
  issues: [],
  simResult: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  highlightedNodeIds: new Set(),
  highlightedEdgeIds: new Set(),

  onNodesChange: (changes) => {
    const nodes = applyNodeChanges(changes, get().nodes) as Node<NodeData>[]
    set({ nodes, issues: runValidation(nodes, get().edges, get().settings) })
  },

  onEdgesChange: (changes) => {
    const edges = applyEdgeChanges(changes, get().edges) as Edge<EdgeData>[]
    set({ edges, issues: runValidation(get().nodes, edges, get().settings) })
  },

  onConnect: (connection) => {
    const newEdge: Edge<EdgeData> = {
      ...connection,
      id: `edge-${Date.now()}`,
      data: {
        preset: 'connector',
        widthM: 3.0,
        lengthMode: 'auto',
      },
    } as Edge<EdgeData>
    const edges = addEdge(newEdge, get().edges) as Edge<EdgeData>[]
    set({ edges, issues: runValidation(get().nodes, edges, get().settings) })
  },

  addNode: (node) => {
    const nodes = [...get().nodes, node]
    set({ nodes, issues: runValidation(nodes, get().edges, get().settings) })
  },

  updateNodeData: (id, data) => {
    const nodes = get().nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n)
    set({ nodes, issues: runValidation(nodes, get().edges, get().settings) })
  },

  updateEdgeData: (id, data) => {
    const edges = get().edges.map(e => e.id === id ? { ...e, data: { ...e.data!, ...data } } : e)
    set({ edges, issues: runValidation(get().nodes, edges, get().settings) })
  },

  setSelectedNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  setSimResult: (result) => set({ simResult: result }),
  setHighlighted: (nodeIds, edgeIds) => set({
    highlightedNodeIds: new Set(nodeIds),
    highlightedEdgeIds: new Set(edgeIds)
  }),

  updateSettings: (newSettings) => {
    const settings = { ...get().settings, ...newSettings }
    set({ settings, issues: runValidation(get().nodes, get().edges, settings) })
  },

  importGraph: (nodes, edges, settings) => {
    set({
      nodes,
      edges,
      settings,
      issues: runValidation(nodes, edges, settings),
      simResult: null,
    })
  },
}))
