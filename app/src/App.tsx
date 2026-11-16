import { useCallback, useState } from 'react'
import { applySettings, loadSettings, saveSettings, type Settings } from './core/settings'
import { ErrorBoundary } from './ui/Shell'
import { ConfirmProvider, ToastProvider, useRoute } from './ui/router'
import { ExportScreen } from './ui/screens/Export'
import { Home } from './ui/screens/Home'
import { ImportScreen } from './ui/screens/Import'
import { Library } from './ui/screens/Library'
import { Memo } from './ui/screens/Memo'
import { Reader } from './ui/screens/Reader'
import { SearchScreen } from './ui/screens/Search'
import { HiddenScreen, SettingsScreen } from './ui/screens/Settings'

function Routes({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const { path, query } = useRoute()
  const [a, b, c] = path

  if (!a) return <Home />
  if (a === 'p' && b) return c === 'import' ? <ImportScreen platformId={b} /> : <Library platformId={b} />
  if (a === 'c' && b) return <Reader key={b + (query.get('m') ?? '')} convKey={b} focusId={query.get('m') ?? undefined} />
  if (a === 'search') return <SearchScreen platformId={query.get('platform') ?? undefined} />
  if (a === 'memo') return <Memo />
  if (a === 'export') return <ExportScreen currentTheme={settings.theme} />
  if (a === 'settings') return b === 'hidden' ? <HiddenScreen /> : <SettingsScreen settings={settings} onChange={onSettings} />
  return <Home />
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = loadSettings()
    applySettings(s)
    return s
  })
  const update = useCallback((s: Settings) => {
    setSettings(s)
    saveSettings(s)
    applySettings(s)
  }, [])

  return (
    <div className="hy-root stage">
      <div className="phone">
        <ErrorBoundary>
          <ConfirmProvider>
            <ToastProvider>
              <Routes settings={settings} onSettings={update} />
            </ToastProvider>
          </ConfirmProvider>
        </ErrorBoundary>
      </div>
    </div>
  )
}
