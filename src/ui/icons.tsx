/*
 * Inline SVG icon set: tray icons per PlaceableKind, and small UI glyphs. All draw with
 * currentColor so they inherit button text colour, and take a `size` prop (default 22).
 */
import type { ReactElement, ReactNode } from 'react'
import type { PlaceableKind } from '../game/types.ts'

export interface IconProps {
  size?: number
  className?: string
}

function base(size = 22, className: string | undefined, children: ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function DominoIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <rect x="8" y="3" width="8" height="18" rx="1.6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </g>
  ))
}

export function TallDominoIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <rect x="9" y="2" width="6" height="20" rx="1.4" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <circle cx="12" cy="6" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="0.7" fill="currentColor" stroke="none" />
    </g>
  ))
}

export function RampIcon({ size, className }: IconProps) {
  return base(size, className, <path d="M4 19h16L6 6h-2z" />)
}

export function StairsIcon({ size, className }: IconProps) {
  return base(size, className, <path d="M4 19h4v-4h4v-4h4V7h4" />)
}

export function LeverIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <line x1="3" y1="17" x2="21" y2="7" />
      <path d="M9 15.5V21h6v-5.5" />
    </g>
  ))
}

export function MarbleIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <circle cx="12" cy="12" r="8" />
      <path d="M7 8c2 2 8 2 10 0" opacity="0.6" />
    </g>
  ))
}

export function BridgeIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <path d="M3 16c3-6 15-6 18 0" />
      <line x1="3" y1="16" x2="3" y2="20" />
      <line x1="21" y1="16" x2="21" y2="20" />
    </g>
  ))
}

export function SpringIcon({ size, className }: IconProps) {
  return base(size, className, (
    <path d="M6 20c0-3 12-1 12-4s-12-1-12-4 12-1 12-4" />
  ))
}

export const PIECE_ICONS: Record<PlaceableKind, (props: IconProps) => ReactElement> = {
  domino: DominoIcon,
  tallDomino: TallDominoIcon,
  ramp: RampIcon,
  stairs: StairsIcon,
  lever: LeverIcon,
  marble: MarbleIcon,
  bridge: BridgeIcon,
  spring: SpringIcon,
}

export function StarIcon({ size, className, filled = true }: IconProps & { filled?: boolean }) {
  return (
    <svg
      width={size ?? 22}
      height={size ?? 22}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 2.5l2.9 6.4 7 .7-5.3 4.8 1.6 6.9-6.2-3.6-6.2 3.6 1.6-6.9-5.3-4.8 7-.7z"
        fill={filled ? '#ffcc33' : 'none'}
        stroke={filled ? '#c9861a' : 'currentColor'}
        strokeWidth={filled ? 0.8 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LockIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </g>
  ))
}

export function GearIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M4.6 6.6l2.1 2.1M17.3 15.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 17.4l2.1-2.1M17.3 8.7l2.1-2.1" />
    </g>
  ))
}

export function SoundOnIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <path d="M4 10v4h4l5 4V6l-5 4z" />
      <path d="M17 9a4.5 4.5 0 0 1 0 6" />
      <path d="M19.5 6.5a8.5 8.5 0 0 1 0 11" />
    </g>
  ))
}

export function SoundOffIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <path d="M4 10v4h4l5 4V6l-5 4z" />
      <line x1="16" y1="9" x2="21" y2="15" />
      <line x1="21" y1="9" x2="16" y2="15" />
    </g>
  ))
}

export function UndoIcon({ size, className }: IconProps) {
  return base(size, className, <path d="M7 8H4V5M4 8a8 8 0 1 1 2.3 8.6" />)
}

export function RedoIcon({ size, className }: IconProps) {
  return base(size, className, <path d="M17 8h3V5M20 8a8 8 0 1 0-2.3 8.6" />)
}

export function RotateLeftIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <rect x="10" y="9" width="4" height="9" rx="1" />
      <path d="M5 13a7 7 0 0 1 11-5.7M5 13l-1.5-3M5 13l3-1.2" />
    </g>
  ))
}

export function RotateRightIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <rect x="10" y="9" width="4" height="9" rx="1" />
      <path d="M19 13a7 7 0 0 0-11-5.7M19 13l1.5-3M19 13l-3-1.2" />
    </g>
  ))
}

export function TrashIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </g>
  ))
}

export function ResetViewIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <circle cx="12" cy="12" r="3" />
    </g>
  ))
}

export function ClearAllIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </g>
  ))
}

export function PlayIcon({ size, className }: IconProps) {
  return (
    <svg width={size ?? 22} height={size ?? 22} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M6 4l14 8-14 8z" fill="currentColor" />
    </svg>
  )
}

export function StopIcon({ size, className }: IconProps) {
  return (
    <svg width={size ?? 22} height={size ?? 22} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
    </svg>
  )
}

export function QuestionIcon({ size, className }: IconProps) {
  return base(size, className, (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2 1-1.2 2" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </g>
  ))
}

export function BackArrowIcon({ size, className }: IconProps) {
  return base(size, className, <path d="M14 5l-7 7 7 7M7 12h13" />)
}

export function ChevronIcon({ size, className }: IconProps) {
  return base(size, className, <path d="M9 5l7 7-7 7" />)
}
