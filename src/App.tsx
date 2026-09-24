/*
 * App shell: hash routing, save data, and global settings (mute, reduced motion). Renders the
 * menu or the play screen for the current route.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { audio } from './audio.ts'
import { getLevel, SANDBOX_LEVEL } from './game/levels/index.ts'
import { isUnlocked } from './game/rules.ts'
import { formatRoute, parseHash } from './game/routes.ts'
import { loadSave, writeSave } from './game/storage.ts'
import type { LevelProgress, Route, SaveData, Settings } from './game/types.ts'
import { Menu } from './ui/Menu.tsx'
import { MenuBackdrop } from './ui/MenuBackdrop.tsx'
import { PlayScreen } from './ui/PlayScreen.tsx'

function readRoute(): Route {
  return parseHash(window.location.hash)
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [save, setSave] = useState<SaveData>(loadSave)

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Unlock the audio context on the first user gesture anywhere.
  useEffect(() => {
    const unlock = () => audio.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Apply settings whenever they change.
  useEffect(() => {
    audio.setMuted(save.settings.muted)
  }, [save.settings.muted])

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', save.settings.reducedMotion)
  }, [save.settings.reducedMotion])

  const navigate = useCallback((next: Route) => {
    window.location.hash = formatRoute(next)
  }, [])

  const updateSave = useCallback((updater: (prev: SaveData) => SaveData) => {
    setSave((prev) => {
      const next = updater(prev)
      if (!writeSave(next)) console.warn('Domino Topple: could not save progress to localStorage.')
      return next
    })
  }, [])

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      updateSave((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
    },
    [updateSave],
  )

  const onProgress = useCallback(
    (levelId: number, progress: LevelProgress) => {
      updateSave((prev) => ({ ...prev, levels: { ...prev.levels, [levelId]: progress } }))
    },
    [updateSave],
  )

  const setSeenCoach = useCallback(() => {
    updateSave((prev) => (prev.seenCoach ? prev : { ...prev, seenCoach: true }))
  }, [updateSave])

  const resetProgress = useCallback(() => {
    updateSave(() => ({ ...loadSave(), levels: {}, seenCoach: false }))
  }, [updateSave])

  const level = useMemo(() => {
    if (route.name === 'sandbox') return SANDBOX_LEVEL
    if (route.name === 'level') return getLevel(route.id) ?? null
    return null
  }, [route])

  // A locked level route redirects to the menu.
  useEffect(() => {
    if (route.name === 'level' && (!level || !isUnlocked(route.id, save))) {
      navigate({ name: 'menu' })
    }
  }, [route, level, save, navigate])

  if (route.name !== 'menu' && level) {
    return (
      <PlayScreen
        level={level}
        save={save}
        onProgress={onProgress}
        onSeenCoach={setSeenCoach}
        onSettingsChange={updateSettings}
        onExit={() => navigate({ name: 'menu' })}
      />
    )
  }

  return (
    <>
      <MenuBackdrop settings={save.settings} />
      <Menu save={save} onNavigate={navigate} onSettingsChange={updateSettings} onResetProgress={resetProgress} />
    </>
  )
}
