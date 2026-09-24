import { motion } from 'framer-motion'

function getScoreColor(score) {
  if (score < 40) return '#ef4444'
  if (score < 70) return '#f59e0b'
  return '#16a34a'
}

function getScoreLabel(score) {
  if (score <= 30) return 'Critical'
  if (score <= 50) return 'Poor'
  if (score <= 70) return 'Fair'
  if (score <= 85) return 'Good'
  return 'Excellent'
}

function Bar({ label, value, color, delay }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-stone-500 text-right font-mono-ui" style={{ width: 90, flexShrink: 0 }}>{label}</span>
      <div className="flex-1 bg-stone-200 rounded-full h-2 overflow-hidden">
        <motion.div
          className="h-2 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, value)}%` }}
          transition={{ duration: 0.6, delay, ease: 'easeOut' }}
        />
      </div>
      <span className="text-stone-600 font-medium font-mono-ui" style={{ width: 28, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

export default function HealthScore({ scoreData }) {
  if (!scoreData) return null

  const { overall = 50, complexity = 50, documentation = 10, modernisation = 30, risk_level = 60 } = scoreData
  const color = getScoreColor(overall)
  const label = getScoreLabel(overall)

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <motion.span
          className="text-4xl font-bold font-display"
          style={{ color }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'backOut' }}
        >
          {overall}
        </motion.span>
        <div>
          <div className="text-sm font-semibold font-display" style={{ color }}>{label}</div>
          <div className="text-xs text-stone-400 font-mono-ui">Health Score</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Bar label="Complexity" value={complexity} color="#1c1917" delay={0.05} />
        <Bar label="Docs" value={documentation} color="#0d9488" delay={0.1} />
        <Bar label="Modernisation" value={modernisation} color="#7c3aed" delay={0.15} />
        <Bar label="Risk Level" value={risk_level} color="#ef4444" delay={0.2} />
      </div>
      <p className="text-xs text-stone-400 mt-3">Higher risk level = more dangerous. All scores 0–100.</p>
    </div>
  )
}
