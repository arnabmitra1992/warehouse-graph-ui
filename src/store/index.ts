import { create } from 'zustand'
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import type {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
} from '@xyflow/react'
import type { NodeData, EdgeData, AppSettings, LayoutUnderlay } from '../graph/types'
import { validateGraph } from '../validation'
import type { ValidationIssue } from '../validation/types'
import type { SimResult } from '../simulation/types'

interface AppState {
  nodes: Node<NodeData>[]
  edges: Edge<EdgeData>[]
  settings: AppSettings
  underlay: LayoutUnderlay | null
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
  removeNode: (id: string) => void
  updateNodeData: (id: string, data: Partial<NodeData>) => void
  removeEdge: (id: string) => void
  updateEdgeData: (id: string, data: Partial<EdgeData>) => void
  setSelectedNode: (id: string | null) => void
  setSelectedEdge: (id: string | null) => void
  setSimResult: (result: SimResult | null) => void
  setHighlighted: (nodeIds: string[], edgeIds: string[]) => void
  updateSettings: (settings: Partial<AppSettings>) => void
  setUnderlay: (underlay: LayoutUnderlay | null) => void
  importGraph: (nodes: Node<NodeData>[], edges: Edge<EdgeData>[], settings: AppSettings, underlay?: LayoutUnderlay | null) => void
}

function normalizeNode(node: Node<NodeData>): Node<NodeData> {
  return {
    ...node,
    draggable: true,
    selectable: true,
    connectable: true,
    dragHandle: '.node-drag-handle',
  }
}

function runValidation(nodes: Node<NodeData>[], edges: Edge<EdgeData>[], settings: AppSettings): ValidationIssue[] {
  return validateGraph(nodes, edges, settings)
}

export const useStore = create<AppState>((set, get) => ({
  nodes: [],
  edges: [],
  settings: {
    metersPerPixel: 0.05,
    simulator: {
      storageTypesInUse: ['rack'],
      randomSeed: 42,
      inboundDailyPallets: 500,
      outboundDailyPallets: 500,
      operatingHours: 16,
      utilizationTarget: 0.75,
      rackDailyPallets: 500,
      rackHeightMm: 3900,
      stackingDailyPallets: 200,
      rackLevels: 3,
      shelfHeightSpacingMm: 1300,
      positionSpacingMm: 950,
      forceExplicitHandover: false,
      stackingRows: 10,
      stackingColumns: 12,
      stackingLevels: 3,
      blockStoragePolicy: 'lane_sequence',
      trafficControlEnabled: false,
      intersectionCount: 0,
      intersectionCycleTimeS: 30,
    },
  },
  underlay: null,
  issues: [],
  simResult: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  highlightedNodeIds: new Set(),
  highlightedEdgeIds: new Set(),

  onNodesChange: (changes) => {
    const nodes = (applyNodeChanges(changes, get().nodes) as Node<NodeData>[]).map(normalizeNode)
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
        priorityStream: 'shared',
      },
    } as Edge<EdgeData>
    const edges = addEdge(newEdge, get().edges) as Edge<EdgeData>[]
    set({ edges, issues: runValidation(get().nodes, edges, get().settings) })
  },

  addNode: (node) => {
    const nodes = [...get().nodes, normalizeNode(node)]
    set({ nodes, issues: runValidation(nodes, get().edges, get().settings) })
  },
  removeNode: (id) => {
    const nodes = get().nodes.filter((n) => n.id !== id)
    const edges = get().edges.filter((e) => e.source !== id && e.target !== id)
    set({
      nodes,
      edges,
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
      issues: runValidation(nodes, edges, get().settings),
    })
  },

  updateNodeData: (id, data) => {
    const nodes = get().nodes.map(n => n.id === id ? normalizeNode({ ...n, data: { ...n.data, ...data } }) : n)
    set({ nodes, issues: runValidation(nodes, get().edges, get().settings) })
  },

  updateEdgeData: (id, data) => {
    const edges = get().edges.map(e => e.id === id ? { ...e, data: { ...e.data!, ...data } } : e)
    set({ edges, issues: runValidation(get().nodes, edges, get().settings) })
  },
  removeEdge: (id) => {
    const edges = get().edges.filter((e) => e.id !== id)
    set({
      edges,
      selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
      issues: runValidation(get().nodes, edges, get().settings),
    })
  },

  setSelectedNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  setSimResult: (result) => set({ simResult: result }),
  setHighlighted: (nodeIds, edgeIds) => set({
    highlightedNodeIds: new Set(nodeIds),
    highlightedEdgeIds: new Set(edgeIds)
  }),

  updateSettings: (newSettings) => {
    const settings = {
      ...get().settings,
      ...newSettings,
      simulator: {
        ...get().settings.simulator,
        ...(newSettings.simulator ?? {}),
      },
    }
    set({ settings, issues: runValidation(get().nodes, get().edges, settings) })
  },

  setUnderlay: (underlay) => set({ underlay }),

  importGraph: (nodes, edges, settings, underlay = null) => {
    const normalizedNodes = nodes.map(normalizeNode)
    set({
      nodes: normalizedNodes,
      edges,
      settings,
      underlay,
      issues: runValidation(normalizedNodes, edges, settings),
      simResult: null,
    })
  },
}))
