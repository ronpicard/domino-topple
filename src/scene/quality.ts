/*
 * Auto quality-tier probe: measures the median frame time over a short window after mount and
 * reports a tier once. Used by GameCanvas when the player's setting is 'auto'.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { QualityTier } from '../game/types.ts'

const SAMPLE_START_FRAME = 30
const SAMPLE_END_FRAME = 90

export function useFrameTimeProbe(onMeasured?: (tier: QualityTier) => void): void {
  const frameRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const samplesRef = useRef<number[]>([])
  const doneRef = useRef(false)

  useFrame(() => {
    if (doneRef.current) return
    const now = performance.now()
    const frame = frameRef.current
    frameRef.current = frame + 1
    if (lastRef.current !== null && frame >= SAMPLE_START_FRAME && frame < SAMPLE_END_FRAME) {
      samplesRef.current.push(now - lastRef.current)
    }
    lastRef.current = now
    if (frame + 1 >= SAMPLE_END_FRAME) {
      doneRef.current = true
      const samples = samplesRef.current.slice().sort((a, b) => a - b)
      const median = samples.length > 0 ? samples[Math.floor(samples.length / 2)] : 16
      const coarsePointer = matchesCoarsePointer()
      let tier: QualityTier
      if (median < 11 && !coarsePointer) tier = 'high'
      else if (median < 20) tier = 'medium'
      else tier = 'low'
      onMeasured?.(tier)
    }
  })
}

function matchesCoarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}
