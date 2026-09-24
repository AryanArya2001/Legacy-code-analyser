import { useState } from 'react'
import { motion } from 'framer-motion'
import Header from './components/Header'
import CodeEditor from './components/CodeEditor'
import OutputPanel from './components/OutputPanel'
import { useAnalyse } from './hooks/useAnalyse'

export default function App() {
  const [code, setCode] = useState('')
  const [mode, setMode] = useState('explain')
  const [filename, setFilename] = useState('')
  const [zipFile, setZipFile] = useState(null)

  const { result, loading, error, tokensUsed, chunksProcessed, modeErrors, filesAnalysed, progress, analyse, analyseZip } = useAnalyse()

  const handleAnalyse = () => {
    if (zipFile) {
      analyseZip(zipFile)
    } else {
      analyse(code, mode, filename)
    }
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 0% 0%, #f1efea 0%, #e7e5e4 100%)',
      }}
    >
      <Header />
      <main className="flex-1 grid grid-cols-2 gap-3 p-3 overflow-hidden min-h-0">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="min-h-0 h-full"
        >
          <CodeEditor
            code={code}
            setCode={setCode}
            mode={mode}
            setMode={setMode}
            onAnalyse={handleAnalyse}
            loading={loading}
            filename={filename}
            setFilename={setFilename}
            zipFile={zipFile}
            setZipFile={setZipFile}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
          className="min-h-0 h-full"
        >
          <OutputPanel
            result={result}
            loading={loading}
            error={error}
            tokensUsed={tokensUsed}
            chunksProcessed={chunksProcessed}
            filename={filename}
            mode={mode}
            modeErrors={modeErrors}
            filesAnalysed={filesAnalysed}
            progress={progress}
          />
        </motion.div>
      </main>
    </div>
  )
}