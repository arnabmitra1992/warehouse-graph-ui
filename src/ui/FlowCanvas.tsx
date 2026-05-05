import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react'
import type { NodeTypes, Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../store'
import type { NodeData, EdgeData } from '../graph/types'
import { SourceGateNode } from './nodes/SourceGateNode'
import { HandoverNode } from './nodes/HandoverNode'
import { RackAisleNode } from './nodes/RackAisleNode'
import { TurnNode } from './nodes/TurnNode'

const nodeTypes: NodeTypes = {
  source_gate: SourceGateNode,
  handover: HandoverNode,
  rack_aisle: RackAisleNode,
  turn: TurnNode,
}

function FlowCanvasInner() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    setSelectedNode,
    setSelectedEdge,
    highlightedNodeIds,
    highlightedEdgeIds,
  } = useStore()

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const kind = event.dataTransfer.getData('application/reactflow') as NodeData['kind']
      if (!kind) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node<NodeData> = {
        id: `node-${Date.now()}`,
        type: kind,
        position,
        data: { kind, label: kind === 'source_gate' ? 'SG' : undefined },
      }

      addNode(newNode)
    },
    [screenToFlowPosition, addNode]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
    },
    [setSelectedNode]
  )

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.id)
    },
    [setSelectedEdge]
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [setSelectedNode, setSelectedEdge])

  // Apply highlighting styles
  const styledNodes = nodes.map((n) => ({
    ...n,
    style: {
      ...n.style,
      opacity: highlightedNodeIds.size > 0 ? (highlightedNodeIds.has(n.id) ? 1 : 0.3) : 1,
    },
  }))

  const styledEdges = (edges as Edge<EdgeData>[]).map((e) => ({
    ...e,
    style: {
      ...e.style,
      opacity: highlightedEdgeIds.size > 0 ? (highlightedEdgeIds.has(e.id) ? 1 : 0.3) : 1,
      strokeWidth: highlightedEdgeIds.has(e.id) ? 3 : 1.5,
      stroke: highlightedEdgeIds.has(e.id)
        ? '#f59e0b'
        : e.data?.preset === 'rack_aisle'
        ? '#f97316'
        : e.data?.preset === 'head_aisle'
        ? '#3b82f6'
        : e.data?.preset === 'corridor'
        ? '#22c55e'
        : '#94a3b8',
    },
    animated: highlightedEdgeIds.has(e.id),
  }))

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        selectionMode={SelectionMode.Partial}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap nodeStrokeWidth={3} />
      </ReactFlow>
    </div>
  )
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  )
}
