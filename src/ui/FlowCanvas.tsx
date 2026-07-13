import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
} from '@xyflow/react'
import type { NodeTypes, Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../store'
import type { NodeData, EdgeData } from '../graph/types'
import { SourceGateNode } from './nodes/SourceGateNode'
import { HandoverNode } from './nodes/HandoverNode'
import { RackAisleNode } from './nodes/RackAisleNode'
import { TurnNode } from './nodes/TurnNode'
import { OutboundGateNode } from './nodes/OutboundGateNode'
import { GroundStorageNode } from './nodes/GroundStorageNode'
import { RestPointNode } from './nodes/RestPointNode'

const nodeTypes: NodeTypes = {
  source_gate: SourceGateNode,
  handover: HandoverNode,
  rack_aisle: RackAisleNode,
  turn: TurnNode,
  outbound_gate: OutboundGateNode,
  ground_storage: GroundStorageNode,
  rest_point: RestPointNode,
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
    underlay,
    settings,
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
        data: {
          kind,
          label:
            kind === 'source_gate'
              ? 'SG'
              : kind === 'outbound_gate'
              ? 'OG'
              : kind === 'rest_point'
              ? 'REST'
              : undefined,
          storageType: kind === 'rack_aisle' ? 'rack' : kind === 'ground_storage' ? 'ground_storage' : undefined,
          blockRows: kind === 'ground_storage' ? settings.simulator.stackingRows : undefined,
          blockColumns: kind === 'ground_storage' ? settings.simulator.stackingColumns : undefined,
          blockLevels: kind === 'ground_storage'
            ? (settings.simulator.storageTypesInUse.includes('ground_stacking') && !settings.simulator.storageTypesInUse.includes('ground_storage')
              ? settings.simulator.stackingLevels
              : 1)
            : undefined,
          boxLengthMm: kind === 'ground_storage' ? settings.simulator.stackingBoxLengthMm : undefined,
          boxWidthMm: kind === 'ground_storage' ? settings.simulator.stackingBoxWidthMm : undefined,
          clearanceMm: kind === 'ground_storage' ? settings.simulator.stackingClearanceMm : undefined,
        },
      }

      addNode(newNode)
    },
    [screenToFlowPosition, addNode, settings]
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
        : e.data?.preset === 'storage_aisle'
        ? '#14b8a6'
        : e.data?.preset === 'head_aisle'
        ? '#3b82f6'
        : e.data?.preset === 'corridor'
        ? '#22c55e'
        : '#94a3b8',
    },
    animated: highlightedEdgeIds.has(e.id),
  }))

  return (
    <div ref={reactFlowWrapper} className="relative flex-1 h-full">
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
        nodesDraggable
        elementsSelectable
        nodesConnectable
        selectionMode={SelectionMode.Partial}
        fitView
        className="relative z-10"
      >
        {underlay && (
          <ViewportPortal>
            <div className="pointer-events-none absolute left-0 top-0 -z-10">
              {underlay.mimeType === 'application/pdf' ? (
                <embed
                  src={underlay.dataUrl}
                  type="application/pdf"
                  width={1600}
                  height={1200}
                  style={{ opacity: underlay.opacity }}
                />
              ) : (
                <img
                  src={underlay.dataUrl}
                  alt={underlay.name}
                  width={1600}
                  height={1200}
                  style={{ opacity: underlay.opacity }}
                />
              )}
            </div>
          </ViewportPortal>
        )}
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
