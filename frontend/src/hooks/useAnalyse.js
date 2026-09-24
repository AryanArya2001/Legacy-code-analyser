import { useState } from 'react'
import axios from 'axios'

const ALL_MODES = ['explain', 'convert', 'debug', 'docs', 'remediation']
const MODE_LABELS = {
  explain: 'Explain',
  convert: 'Convert',
  debug: 'Find Bugs',
  docs: 'Generate Docs',
  remediation: 'Remediation Plan',
}

export function useAnalyse() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tokensUsed, setTokensUsed] = useState(0)
  const [chunksProcessed, setChunksProcessed] = useState(0)
  const [modeErrors, setModeErrors] = useState({})
  const [filesAnalysed, setFilesAnalysed] = useState(null)
  const [progress, setProgress] = useState(null) // { current, total, label }

  // Runs all 5 modes sequentially against a single request-sender function,
  // merges the results, and updates state. Shared by both plain-code and
  // zip-upload analysis so they behave identically once the request is made.
  const runAllModes = async (sendRequest) => {
    setLoading(true)
    setError(null)
    setModeErrors({})
    setResult(null)
    setFilesAnalysed(null)
    setProgress({ current: 0, total: ALL_MODES.length, label: 'Starting…' })

    const merged = {}
    const errorsByMode = {}
    let totalTokens = 0
    let totalChunks = 0
    let successCount = 0
    let lastFilesAnalysed = null

    try {
      // Run sequentially (not in parallel) so we don't slam the Gemini
      // free-tier rate limit with 5 simultaneous requests, which was
      // causing convert/debug/docs/remediation to silently fail.
      for (let i = 0; i < ALL_MODES.length; i++) {
        const m = ALL_MODES[i]
        setProgress({ current: i, total: ALL_MODES.length, label: MODE_LABELS[m] })

        try {
          const data = await sendRequest(m)

          if (data.result && !data.result.error) {
            Object.assign(merged, data.result)
            successCount += 1
          } else {
            errorsByMode[m] = data.result?.error || 'Unknown error'
          }

          totalTokens = Math.max(totalTokens, data.tokens || 0)
          totalChunks = Math.max(totalChunks, data.chunks_processed || 1)
          if (data.files_analysed) lastFilesAnalysed = data.files_analysed
        } catch (err) {
          errorsByMode[m] = err.response?.data?.detail || err.message || 'Request failed'
        }

        setProgress({ current: i + 1, total: ALL_MODES.length, label: MODE_LABELS[m] })
      }

      setModeErrors(errorsByMode)
      setFilesAnalysed(lastFilesAnalysed)

      if (successCount === 0) {
        setError(Object.values(errorsByMode)[0] || 'All analysis modes failed')
        setResult(null)
      } else {
        setResult(merged)
        setTokensUsed(totalTokens)
        setChunksProcessed(totalChunks)
      }
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.message ||
        'Failed to connect to backend. Is it running on port 8000?'
      setError(msg)
      setResult(null)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const analyse = async (code, mode, filename) => {
    if (!code || !code.trim()) return

    await runAllModes((m) =>
      axios
        .post('http://localhost:8000/analyse', {
          code,
          mode: m,
          filename: filename || 'untitled',
        })
        .then((res) => res.data)
    )
  }

  // Analyse an entire uploaded .zip project as one combined system.
  const analyseZip = async (zipFile) => {
    if (!zipFile) return

    await runAllModes((m) => {
      const formData = new FormData()
      formData.append('file', zipFile)
      formData.append('mode', m)
      return axios
        .post('http://localhost:8000/analyse-zip', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((res) => res.data)
    })
  }

  const reset = () => {
    setResult(null)
    setLoading(false)
    setError(null)
    setTokensUsed(0)
    setChunksProcessed(0)
    setModeErrors({})
    setFilesAnalysed(null)
    setProgress(null)
  }

  return {
    result,
    loading,
    error,
    tokensUsed,
    chunksProcessed,
    modeErrors,
    filesAnalysed,
    progress,
    analyse,
    analyseZip,
    reset,
  }
}