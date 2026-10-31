import { Routes, Route } from 'react-router-dom'

/**
 * App — top-level router.
 * Pages are added here as each phase completes.
 * Phase 0: renders a placeholder so we can verify the dark shell loads.
 */
export default function App() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
      }}
    >
      <Routes>
        <Route
          path="/"
          element={
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                Phase 0 — shell ready
              </p>
              <h1
                style={{
                  color: 'var(--accent-lime)',
                  fontSize: 'var(--text-3xl)',
                  fontWeight: 'var(--font-bold)',
                  marginTop: '8px',
                }}
              >
                Brightloop
              </h1>
              <p style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: 'var(--text-sm)' }}>
                Tokens ✓ &nbsp;|&nbsp; Tailwind ✓ &nbsp;|&nbsp; Fonts ✓ &nbsp;|&nbsp; Router ✓
              </p>
            </div>
          }
        />
      </Routes>
    </div>
  )
}
