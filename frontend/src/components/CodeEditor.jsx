import { useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import MonacoEditor from '@monaco-editor/react'

const MODES = [
  { key: 'explain', icon: '📖', label: 'Explain' },
  { key: 'convert', icon: '🔄', label: 'Convert' },
  { key: 'debug', icon: '🐛', label: 'Find Bugs' },
  { key: 'docs', icon: '📄', label: 'Generate Docs' },
  { key: 'remediation', icon: '🔧', label: 'Remediation Plan' },
]

function estimateTokens(code) {
  return Math.ceil((code || '').length / 4)
}

export default function CodeEditor({ code, setCode, mode, setMode, onAnalyse, loading, filename, setFilename, zipFile, setZipFile }) {
  const dropRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileRead = useCallback((file) => {
    if (file.name.toLowerCase().endsWith('.zip')) {
      // Zip projects are sent to the backend as-is for extraction;
      // there's no single text blob to preview in Monaco.
      setZipFile(file)
      setFilename(file.name)
      setCode('')
      return
    }

    setZipFile(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      setCode(e.target.result)
      setFilename(file.name)
    }
    reader.readAsText(file)
  }, [setCode, setFilename, setZipFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileRead(file)
  }, [handleFileRead])

  const handleFileInput = (e) => {
    const file = e.target.files[0]
    if (file) handleFileRead(file)
  }

  const clearZip = () => {
    setZipFile(null)
    setFilename('')
    setCode('')
  }

  const tokens = estimateTokens(code)
  const willChunk = tokens > 8000
  const hasContent = zipFile || code.trim()

  return (
    <div
      className="flex flex-col h-full rounded-xl border overflow-hidden shadow-sm"
      style={{ background: '#ffffff', borderColor: '#e7e5e4' }}
    >
      {/* Mode selector */}
      <div className="flex gap-1 p-2 border-b flex-wrap relative" style={{ background: '#fafaf9', borderColor: '#f1efea' }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === m.key
                ? 'text-stone-900'
                : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'
            }`}
          >
            {mode === m.key && (
              <motion.div
                layoutId="mode-pill"
                className="absolute inset-0 rounded-lg shadow-sm border"
                style={{ background: '#ffffff', borderColor: '#e7c08e' }}
                transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
              />
            )}
            <span className="relative z-10">{m.icon}</span>
            <span className="relative z-10">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Filename / zip bar */}
      <AnimatePresence>
        {filename && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 py-1.5 text-xs font-mono-ui border-b overflow-hidden flex items-center justify-between"
            style={{ background: '#1c1917', borderColor: '#3f3a36' }}
          >
            <span className="text-amber-300">
              {zipFile ? '🗂️' : '📄'} {filename}
              {zipFile && <span className="text-stone-500 ml-1">· project archive</span>}
            </span>
            {zipFile && (
              <button
                onClick={clearZip}
                className="text-stone-400 hover:text-stone-200 cursor-pointer ml-2"
              >
                ✕ clear
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Monaco Editor or zip placeholder */}
      <div className="flex-1 min-h-0">
        {zipFile ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-8" style={{ background: '#1e1e1e' }}>
            <span className="text-3xl">🗂️</span>
            <p className="text-stone-300 text-sm font-medium">Project archive loaded</p>
            <p className="text-stone-500 text-xs font-mono-ui">
              All files in this zip will be analysed together as one system
            </p>
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            defaultLanguage="plaintext"
            value={code}
            onChange={(val) => setCode(val || '')}
            theme="vs-dark"
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 8, bottom: 8 },
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            }}
          />
        )}
      </div>

      {/* File upload drop zone */}
      <div
        ref={dropRef}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        className={`mx-3 mb-2 mt-2 border-2 border-dashed rounded-lg px-3 py-2 text-center text-xs transition-all cursor-pointer ${
          isDragging
            ? 'border-amber-400 text-amber-600 bg-amber-50 scale-[1.01]'
            : 'border-stone-200 text-stone-400 hover:border-amber-300 hover:text-amber-600'
        }`}
        onClick={() => document.getElementById('file-upload').click()}
      >
        <input
          id="file-upload"
          type="file"
          accept=".java,.txt,.zip"
          className="hidden"
          onChange={handleFileInput}
        />
        Drop a file or <span className="underline">click to upload</span> — single file (.java) or a whole project (.zip)
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between px-3 pb-3 gap-2">
        {zipFile ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-mono-ui bg-amber-100 text-amber-700">
            🗂️ project mode
          </div>
        ) : (
          <motion.div
            key={willChunk ? 'chunk' : 'nochunk'}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-mono-ui ${
              willChunk
                ? 'bg-amber-100 text-amber-700'
                : 'bg-stone-100 text-stone-500'
            }`}
          >
            ~{tokens.toLocaleString()} tokens
            {willChunk && <span className="opacity-70">· will chunk</span>}
          </motion.div>
        )}

        <motion.button
          onClick={onAnalyse}
          disabled={loading || !hasContent}
          whileHover={!loading && hasContent ? { scale: 1.03 } : {}}
          whileTap={!loading && hasContent ? { scale: 0.96 } : {}}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            loading || !hasContent
              ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
              : 'text-stone-900 shadow-sm'
          }`}
          style={
            !loading && hasContent
              ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)' }
              : {}
          }
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analysing…
            </>
          ) : (
            <>✦ Analyse {zipFile ? 'Project' : 'Code'}</>
          )}
        </motion.button>
      </div>
    </div>
  )
}