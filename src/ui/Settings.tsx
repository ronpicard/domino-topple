/* The settings dialog: sound, quality tier, reduced motion, and a confirmed progress reset. */
import { useEffect, useRef } from 'react'
import type { QualityTier, Settings } from '../game/types.ts'

export interface SettingsDialogProps {
  settings: Settings
  measuredQuality: QualityTier
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  onResetProgress?: () => void
}

const QUALITY_OPTIONS: { value: Settings['quality']; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export function SettingsDialog({ settings, measuredQuality, onChange, onClose, onResetProgress }: SettingsDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-overlay">
      <div className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>

        <div className="settings-dialog__row">
          <span className="settings-dialog__label">Sound</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={!settings.muted}
              onChange={(e) => onChange({ muted: !e.target.checked })}
            />
            <span>{settings.muted ? 'Off' : 'On'}</span>
          </label>
        </div>

        <div className="settings-dialog__row">
          <span className="settings-dialog__label">Quality</span>
          <div className="settings-dialog__segmented" role="radiogroup" aria-label="Quality">
            {QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={settings.quality === opt.value}
                className={`segmented__option ${settings.quality === opt.value ? 'segmented__option--active' : ''}`}
                onClick={() => onChange({ quality: opt.value })}
              >
                {opt.label}
                {opt.value === 'auto' && settings.quality === 'auto' && (
                  <span className="settings-dialog__measured"> ({measuredQuality})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-dialog__row">
          <span className="settings-dialog__label">Reduced motion</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => onChange({ reducedMotion: e.target.checked })}
            />
            <span>{settings.reducedMotion ? 'On' : 'Off'}</span>
          </label>
        </div>

        {onResetProgress && (
          <div className="settings-dialog__row">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                if (window.confirm('Reset all level progress? This cannot be undone.')) onResetProgress()
              }}
            >
              Reset progress
            </button>
          </div>
        )}

        <div className="dialog__actions">
          <button type="button" className="btn btn--primary" ref={primaryRef} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
