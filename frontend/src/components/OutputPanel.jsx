import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import HealthScore from './HealthScore'

// Minimal Markdown renderer for AI-generated documentation: headers, bold,
// inline code, unordered/ordered lists and paragraphs. Avoids pulling in a
// full markdown dependency for what is a fairly constrained AI output format.
function renderInline(text) {
  const parts = []
  // Split on **bold** and `code` while keeping the delimiters' content
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  const segments = text.split(tokenRegex)
  segments.forEach((seg, i) => {
    if (!seg) return
    if (seg.startsWith('**') && seg.endsWith('**')) {
      parts.push(<strong key={i} className="font-semibold text-stone-900">{seg.slice(2, -2)}</strong>)
    } else if (seg.startsWith('`') && seg.endsWith('`')) {
      parts.push(
        <code key={i} className="font-mono-ui text-xs bg-stone-100 text-amber-700 px-1.5 py-0.5 rounded">
          {seg.slice(1, -1)}
        </code>
      )
    } else {
      parts.push(seg)
    }
  })
  return parts
}

function Markdown({ content }) {
  if (!content) return null

  const lines = content.split('\n')
  const blocks = []
  let listBuffer = []
  let listType = null // 'ul' | 'ol'

  const flushList = () => {
    if (listBuffer.length === 0) return
    const Tag = listType === 'ol' ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`list-${blocks.length}`} className={`flex flex-col gap-1.5 my-2 ${listType === 'ol' ? 'list-decimal' : 'list-disc'} pl-5`}>
        {listBuffer.map((item, i) => (
          <li key={i} className="text-sm text-stone-700 leading-relaxed">{renderInline(item)}</li>
        ))}
      </Tag>
    )
    listBuffer = []
    listType = null
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd()

    const h3 = line.match(/^###\s+(.*)/)
    const h2 = line.match(/^##\s+(.*)/)
    const h1 = line.match(/^#\s+(.*)/)
    const ulItem = line.match(/^[*-]\s+(.*)/)
    const olItem = line.match(/^\d+\.\s+(.*)/)

    if (h1 || h2 || h3) {
      flushList()
      const text = (h1 || h2 || h3)[1]
      if (h1) blocks.push(<h2 key={idx} className="font-display font-bold text-lg text-stone-900 mt-4 mb-2 first:mt-0">{renderInline(text)}</h2>)
      else if (h2) blocks.push(<h3 key={idx} className="font-display font-semibold text-base text-stone-900 mt-3 mb-1.5">{renderInline(text)}</h3>)
      else blocks.push(<h4 key={idx} className="font-display font-semibold text-sm text-amber-700 mt-3 mb-1">{renderInline(text)}</h4>)
      return
    }

    if (ulItem) {
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listBuffer.push(ulItem[1])
      return
    }

    if (olItem) {
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listBuffer.push(olItem[1])
      return
    }

    flushList()

    if (line.trim() === '') return

    blocks.push(<p key={idx} className="text-sm text-stone-700 leading-relaxed my-1.5">{renderInline(line)}</p>)
  })

  flushList()

  return <div>{blocks}</div>
}

// Guess a syntax-highlight-friendly label from a file extension, purely
// cosmetic (shown as a small badge next to the filename).
function languageLabelFromPath(path) {
  const ext = path.split('.').pop()?.toLowerCase()
  const map = {
    java: 'Java', py: 'Python', js: 'JavaScript', ts: 'TypeScript',
    sql: 'SQL', cbl: 'COBOL', cob: 'COBOL', f90: 'Fortran', f: 'Fortran',
    cs: 'C#', cpp: 'C++', c: 'C', rb: 'Ruby', go: 'Go', kt: 'Kotlin',
  }
  return map[ext] || ext?.toUpperCase() || 'Code'
}

function ModernCodeTab({ modernCode }) {
  // Normalize: backend always sends a list of {path, code}, but guard
  // against a stray plain-string response so the UI never crashes on it.
  const files = Array.isArray(modernCode)
    ? modernCode
    : (typeof modernCode === 'string' && modernCode)
      ? [{ path: 'main', code: modernCode }]
      : []

  const [collapsed, setCollapsed] = useState({})

  if (files.length === 0) {
    return <p className="text-sm text-stone-400">No converted code.</p>
  }

  const allCode = files.map((f) => `// ===== FILE: ${f.path} =====\n${f.code}`).join('\n\n')
  const isSingleFile = files.length === 1

  return (
    <div className="flex flex-col gap-3">
      {!isSingleFile && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-500 font-mono-ui">{files.length} files converted</span>
          <CopyButton text={allCode} label="Copy all" />
        </div>
      )}
      {files.map((file, i) => {
        const isCollapsed = collapsed[file.path]
        return (
          <motion.div
            key={file.path || i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
            className="rounded-xl overflow-hidden border border-stone-200"
          >
            {!isSingleFile && (
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [file.path]: !c[file.path] }))}
                className="w-full flex items-center justify-between px-3 py-2 bg-stone-100 hover:bg-stone-200 transition-colors cursor-pointer text-left"
              >
                <span className="flex items-center gap-2 text-xs font-mono-ui text-stone-700">
                  <span className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>›</span>
                  📄 {file.path}
                  <span className="px-1.5 py-0.5 rounded bg-stone-300 text-stone-600 text-[10px]">
                    {languageLabelFromPath(file.path)}
                  </span>
                </span>
              </button>
            )}
            {!isCollapsed && (
              <div className="relative">
                <div className="absolute top-2 right-2">
                  <CopyButton text={file.code || ''} />
                </div>
                <pre className="bg-stone-950 text-stone-100 font-mono text-xs p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {file.code || '// No code generated for this file'}
                </pre>
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="text-xs px-2 py-1 rounded bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors cursor-pointer"
    >
      {copied ? '✓ Copied' : (label || 'Copy')}
    </button>
  )
}

function SeverityBadge({ severity }) {
  const classes = {
    high: 'bg-red-100 text-red-700 border border-red-200',
    medium: 'bg-amber-100 text-amber-700 border border-amber-200',
    low: 'bg-green-100 text-green-700 border border-green-200',
    critical: 'bg-red-100 text-red-700 border border-red-200',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${classes[severity?.toLowerCase()] || 'bg-stone-100 text-stone-600'}`}>
      {severity || 'unknown'}
    </span>
  )
}

function PriorityBadge({ priority }) {
  const classes = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${classes[priority?.toLowerCase()] || 'bg-stone-100 text-stone-600'}`}>
      {priority}
    </span>
  )
}

function RisksTab({ risks }) {
  if (!risks || risks.length === 0) return <p className="text-stone-400 text-sm">No risks identified.</p>
  return (
    <div className="flex flex-col gap-2">
      {risks.map((risk, i) => {
        const sev = risk.severity?.toLowerCase() || 'low'
        const cardClass = {
          high: 'bg-red-50 border-red-200',
          medium: 'bg-amber-50 border-amber-200',
          low: 'bg-green-50 border-green-200',
          critical: 'bg-red-50 border-red-200',
        }[sev] || 'bg-stone-50 border-stone-200'
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
            className={`rounded-lg border p-3 ${cardClass}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <SeverityBadge severity={risk.severity} />
              {risk.line && <span className="text-xs text-stone-500 font-mono-ui">{risk.line}</span>}
            </div>
            <p className="text-sm text-stone-800 mb-1">{risk.text}</p>
            {risk.fix && (
              <p className="text-xs text-stone-600 bg-white/60 rounded px-2 py-1 mt-1">
                <span className="font-semibold">Fix: </span>{risk.fix}
              </p>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

function SprintTab({ tasks }) {
  if (!tasks || tasks.length === 0) return <p className="text-stone-400 text-sm">No tasks for this sprint.</p>
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((task, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: i * 0.04 }}
          className="bg-stone-50 border border-stone-200 rounded-lg p-3"
        >
          <div className="flex items-center justify-between mb-1">
            <PriorityBadge priority={task.priority} />
            <span className="text-xs text-stone-400 font-medium font-mono-ui">{task.effort}</span>
          </div>
          <p className="text-sm font-semibold text-stone-800 mt-1">{task.task}</p>
          <p className="text-xs text-stone-500 mt-0.5">{task.reason}</p>
        </motion.div>
      ))}
    </div>
  )
}

function FunctionsTab({ functions }) {
  if (!functions || functions.length === 0) return <p className="text-stone-400 text-sm">No functions found.</p>
  return (
    <div className="flex flex-col gap-3">
      {functions.map((fn, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: i * 0.04 }}
          className="bg-stone-50 border border-stone-200 rounded-lg p-3"
        >
          <code className="text-sm font-bold text-amber-700 font-mono-ui">{fn.name}</code>
          <p className="text-sm text-stone-700 mt-1">{fn.purpose}</p>
          {fn.params && <p className="text-xs text-stone-500 mt-1"><span className="font-semibold">Params:</span> {fn.params}</p>}
          {fn.returns && <p className="text-xs text-stone-500 mt-0.5"><span className="font-semibold">Returns:</span> {fn.returns}</p>}
        </motion.div>
      ))}
    </div>
  )
}

const MODE_TABS = {
  explain: ['Summary', 'Logic', 'Risks', 'Health Score'],
  convert: ['Modern Code', 'Changes', 'Warnings'],
  debug: ['Risks', 'Health Score', 'Summary'],
  docs: ['Documentation', 'Functions', 'Overview'],
  remediation: ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Timeline'],
}

function tabHasData(tab, result) {
  switch (tab) {
    case 'Summary': return result.summary !== undefined
    case 'Logic': return result.steps !== undefined
    case 'Modern Code': return result.modern_code !== undefined
    case 'Changes': return result.changes !== undefined
    case 'Risks': return result.risks !== undefined
    case 'Warnings': return result.warnings !== undefined
    case 'Health Score': return result.health_score !== undefined
    case 'Documentation': return result.documentation !== undefined
    case 'Functions': return result.functions !== undefined
    case 'Overview': return result.overview !== undefined
    case 'Sprint 1': return result.sprint_1 !== undefined
    case 'Sprint 2': return result.sprint_2 !== undefined
    case 'Sprint 3': return result.sprint_3 !== undefined
    case 'Timeline': return result.sprint_1 !== undefined || result.sprint_2 !== undefined || result.sprint_3 !== undefined
    default: return false
  }
}

function getTabsForResult(result, mode) {
  if (!result) return []
  // All 5 modes' data is loaded at once, but only show the tabs that
  // belong to the currently selected mode (matching the original
  // per-mode tab layout), filtered to ones that actually have data.
  const candidateTabs = MODE_TABS[mode] || []
  const tabs = candidateTabs.filter((tab) => tabHasData(tab, result))
  return tabs.length ? tabs : candidateTabs
}

function TabContent({ tab, result }) {
  if (!result) return null

  if (tab === 'Summary') return (
    <p className="text-stone-700 text-sm leading-relaxed">{result.summary || result.overview || 'No summary available.'}</p>
  )

  if (tab === 'Logic') return (
    <ol className="flex flex-col gap-2">
      {(result.steps || []).map((step, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
          <span className="text-sm text-stone-700 leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  )

  if (tab === 'Risks') return <RisksTab risks={result.risks} />

  if (tab === 'Health Score') return <HealthScore scoreData={result.health_score} />

  if (tab === 'Modern Code') return <ModernCodeTab modernCode={result.modern_code} />

  if (tab === 'Changes') return (
    <ol className="flex flex-col gap-2">
      {(result.changes || []).map((c, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
          <span className="text-sm text-stone-700 leading-relaxed">{c}</span>
        </li>
      ))}
    </ol>
  )

  if (tab === 'Warnings') return (
    <div className="flex flex-col gap-2">
      {(result.warnings || []).map((w, i) => (
        <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
          <span className="text-amber-500 text-sm">⚠</span>
          <span className="text-sm text-amber-800">{w}</span>
        </div>
      ))}
    </div>
  )

  if (tab === 'Documentation') return (
    <div className="relative">
      <div className="absolute top-2 right-2">
        <CopyButton text={result.documentation || ''} />
      </div>
      <div className="bg-stone-50 rounded-xl p-4 pt-10">
        {result.documentation
          ? <Markdown content={result.documentation} />
          : <p className="text-sm text-stone-400">No documentation generated.</p>}
      </div>
    </div>
  )

  if (tab === 'Functions') return <FunctionsTab functions={result.functions} />

  if (tab === 'Overview') return (
    <p className="text-stone-700 text-sm leading-relaxed">{result.overview || 'No overview available.'}</p>
  )

  if (tab === 'Sprint 1') return <SprintTab tasks={result.sprint_1} />
  if (tab === 'Sprint 2') return <SprintTab tasks={result.sprint_2} />
  if (tab === 'Sprint 3') return <SprintTab tasks={result.sprint_3} />

  if (tab === 'Timeline') return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-stone-700 mb-2">Total Modernisation Estimate</h3>
      <p className="text-lg font-bold text-stone-900">{result.total_estimate || 'See sprints for details'}</p>
      <div className="mt-4 flex flex-col gap-2 text-xs text-stone-500">
        <div className="flex gap-2">
          <span className="w-3 h-3 rounded-sm bg-red-400 mt-0.5 flex-shrink-0" />
          <span>Sprint 1 — Critical fixes ({(result.sprint_1 || []).length} tasks)</span>
        </div>
        <div className="flex gap-2">
          <span className="w-3 h-3 rounded-sm bg-orange-400 mt-0.5 flex-shrink-0" />
          <span>Sprint 2 — High priority improvements ({(result.sprint_2 || []).length} tasks)</span>
        </div>
        <div className="flex gap-2">
          <span className="w-3 h-3 rounded-sm bg-yellow-400 mt-0.5 flex-shrink-0" />
          <span>Sprint 3 — Modernisation ({(result.sprint_3 || []).length} tasks)</span>
        </div>
      </div>
    </div>
  )

  return <p className="text-stone-400 text-sm">No content for this tab.</p>
}

export default function OutputPanel({ result, loading, error, tokensUsed, chunksProcessed, filename, mode, modeErrors, filesAnalysed, progress }) {
  const [activeTab, setActiveTab] = useState(null)

  const tabs = getTabsForResult(result, mode)

  // Show only the tabs belonging to the currently selected mode.
  // Switch to its first tab whenever the mode changes or new results arrive.
  useEffect(() => {
    if (tabs.length > 0) setActiveTab(tabs[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, mode])

  if (loading) {
    const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <div
        className="flex flex-col items-center justify-center h-full rounded-xl border gap-4 relative overflow-hidden px-8"
        style={{ background: '#ffffff', borderColor: '#e7e5e4' }}
      >
        <div className="relative w-12 h-12 flex items-center justify-center">
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: '#fde68a', borderTopColor: '#d97706' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <span className="text-lg">⚙️</span>
        </div>
        <div className="text-center w-full max-w-xs">
          <p className="font-display font-semibold text-stone-700 mb-1">
            {progress ? `Running ${progress.label}…` : 'Analysing your code…'}
          </p>
          <p className="text-xs text-stone-400 font-mono-ui mb-3">
            {progress ? `Step ${Math.min(progress.current + 1, progress.total)} of ${progress.total}` : 'Starting…'}
          </p>
          <div className="bg-stone-200 rounded-full h-1.5 overflow-hidden">
            <motion.div
              className="h-1.5 rounded-full"
              style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (error) return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-full rounded-xl border p-4"
      style={{ background: '#ffffff', borderColor: '#e7e5e4' }}
    >
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex gap-2 items-start">
          <span className="text-red-500 text-lg leading-none">✕</span>
          <div>
            <p className="font-display font-semibold text-red-700 text-sm">Analysis Failed</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    </motion.div>
  )

  if (!result) return (
    <div
      className="flex flex-col items-center justify-center h-full rounded-xl border gap-3 text-center px-8"
      style={{ background: '#ffffff', borderColor: '#e7e5e4' }}
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
        style={{ background: '#fef3e2' }}
      >
        🔍
      </motion.div>
      <p className="text-stone-500 text-sm">Paste or upload code, then click <strong className="text-amber-700">Analyse →</strong></p>
      <p className="text-stone-400 text-xs font-mono-ui">Supports Java</p>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full rounded-xl border overflow-hidden"
      style={{ background: '#ffffff', borderColor: '#e7e5e4' }}
    >
      {/* Stats bar */}
      <div
        className="flex items-center gap-4 px-4 py-2 border-b text-xs text-stone-500 font-mono-ui flex-wrap"
        style={{ background: '#fafaf9', borderColor: '#f1efea' }}
      >
        <span>🔢 <strong className="text-stone-700">{tokensUsed?.toLocaleString()}</strong> tokens</span>
        <span>📦 <strong className="text-stone-700">{chunksProcessed}</strong> {chunksProcessed === 1 ? 'chunk' : 'chunks'}</span>
        {filesAnalysed && filesAnalysed.length > 0 ? (
          <span title={filesAnalysed.join(', ')}>
            🗂️ <strong className="text-stone-700">{filesAnalysed.length}</strong> files analysed
          </span>
        ) : (
          filename && <span>📄 <strong className="text-stone-700">{filename}</strong></span>
        )}
      </div>

      {/* File list for zip projects */}
      {filesAnalysed && filesAnalysed.length > 0 && (
        <details className="px-4 py-1.5 border-b text-xs text-stone-500" style={{ borderColor: '#f1efea' }}>
          <summary className="cursor-pointer hover:text-amber-700 font-mono-ui">View analysed files</summary>
          <ul className="mt-1.5 flex flex-col gap-0.5 font-mono-ui text-stone-600 max-h-32 overflow-y-auto">
            {filesAnalysed.map((f) => <li key={f}>· {f}</li>)}
          </ul>
        </details>
      )}

      {/* Partial failure warning */}
      {modeErrors && Object.keys(modeErrors).length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          ⚠ Some modes failed and their tabs are unavailable:{' '}
          {Object.entries(modeErrors).map(([m, msg], i) => (
            <span key={m}>
              {i > 0 && ', '}
              <strong className="capitalize">{m}</strong> ({msg.slice(0, 60)}{msg.length > 60 ? '…' : ''})
            </span>
          ))}
        </div>
      )}

      {/* Tab row */}
      <div className="flex gap-1 px-3 pt-2 border-b overflow-x-auto" style={{ borderColor: '#f1efea' }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-3 py-2 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === tab
                ? 'text-amber-700'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div
                layoutId="output-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }}
                transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <TabContent tab={activeTab} result={result} />
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}