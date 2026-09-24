export default function Header() {
  return (
    <header
      className="flex items-center justify-between px-4 border-b relative overflow-hidden"
      style={{
        height: '56px',
        flexShrink: 0,
        background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)',
        borderColor: '#3f3a36',
      }}
    >
      {/* subtle top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, #d97706, transparent 60%)' }}
      />

      <div className="flex items-center gap-3 relative z-10">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg relative"
          style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1c1917" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <span className="font-display font-semibold text-stone-50 text-base tracking-tight">
          Legacy Code Analyser
        </span>
        <span
          className="font-mono-ui text-[10px] font-medium px-2 py-0.5 rounded-full tracking-wide uppercase"
          style={{ background: 'rgba(217, 119, 6, 0.15)', color: '#fbbf24', border: '1px solid rgba(217, 119, 6, 0.3)' }}
        >
          AI-powered
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm text-stone-400 relative z-10 font-mono-ui">
        <span className="relative w-2 h-2 rounded-full bg-green-500 inline-block pulse-dot" />
        <span className="text-xs">API Connected</span>
      </div>
    </header>
  )
}
