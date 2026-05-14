import { useState } from 'react'
import { LeftToolbar } from './ui/LeftToolbar'
import { FlowCanvas } from './ui/FlowCanvas'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { IssuesPanel } from './ui/IssuesPanel'
import { SimulationPanel } from './ui/SimulationPanel'
import { TopBar } from './ui/TopBar'

type BottomTab = 'issues' | 'simulation'

function App() {
  const [activeTab, setActiveTab] = useState<BottomTab>('issues')
  const [bottomPanelHeight, setBottomPanelHeight] = useState(260)

  return (
    <div className="flex flex-col w-screen h-screen bg-gray-800 text-white overflow-hidden">
      {/* Top bar */}
      <TopBar />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left toolbar */}
        <LeftToolbar />

        {/* Center canvas + bottom panel */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Canvas fills remaining vertical space minus bottom panel */}
          <div className="flex-1 min-h-0">
            <FlowCanvas />
          </div>

          <div
            className="h-1 cursor-row-resize bg-gray-700 hover:bg-blue-500"
            onMouseDown={(e) => {
              e.preventDefault()
              const startY = e.clientY
              const startH = bottomPanelHeight
              const onMove = (ev: MouseEvent) => {
                const next = Math.max(140, Math.min(520, startH - (ev.clientY - startY)))
                setBottomPanelHeight(next)
              }
              const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
              }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }}
          />
          {/* Bottom panel */}
          <div className="bg-gray-800 border-t border-gray-700 flex flex-col" style={{ height: bottomPanelHeight }}>
            {/* Tabs */}
            <div className="flex border-b border-gray-700 bg-gray-900 shrink-0">
              <button
                onClick={() => setActiveTab('issues')}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === 'issues'
                    ? 'text-white border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Issues
              </button>
              <button
                onClick={() => setActiveTab('simulation')}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === 'simulation'
                    ? 'text-white border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Simulation
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === 'issues' ? <IssuesPanel /> : <SimulationPanel />}
            </div>
          </div>
        </div>

        {/* Right properties panel */}
        <PropertiesPanel />
      </div>
    </div>
  )
}

export default App
