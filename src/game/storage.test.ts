import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  defaultSave,
  loadLayout,
  loadSave,
  parseSave,
  prefersReducedMotion,
  writeLayout,
  writeSave,
} from './storage.ts'
import type { PlacedPiece, SaveData } from './types.ts'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

function withStorage<T>(storage: unknown, fn: () => T): T {
  const original = (globalThis as { localStorage?: unknown }).localStorage
  ;(globalThis as { localStorage?: unknown }).localStorage = storage
  try {
    return fn()
  } finally {
    ;(globalThis as { localStorage?: unknown }).localStorage = original
  }
}

// ---------------------------------------------------------------------------------------------
// prefersReducedMotion

test('prefersReducedMotion: false when matchMedia is unavailable (node)', () => {
  assert.equal(prefersReducedMotion(), false)
})

// ---------------------------------------------------------------------------------------------
// parseSave

test('parseSave: non-object input falls back to default', () => {
  assert.deepEqual(parseSave(null), defaultSave())
  assert.deepEqual(parseSave('nonsense'), defaultSave())
  assert.deepEqual(parseSave(42), defaultSave())
})

test('parseSave: valid save round-trips', () => {
  const save: SaveData = {
    version: 1,
    levels: { 1: { completed: true, stars: 3, bestPieces: 12 } },
    settings: { muted: true, quality: 'high', reducedMotion: true },
    seenCoach: true,
  }
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(save))), save)
})

test('parseSave: drops malformed level entries, keeps good ones', () => {
  const raw = {
    version: 1,
    levels: {
      1: { completed: true, stars: 2, bestPieces: 5 },
      2: { completed: 'yes', stars: 2, bestPieces: 5 }, // wrong type
      3: { completed: true, stars: 'lots', bestPieces: 5 }, // wrong type
      abc: { completed: true, stars: 1, bestPieces: 1 }, // non-numeric key
      4: null, // not an object
    },
    settings: {},
    seenCoach: false,
  }
  const parsed = parseSave(raw)
  assert.deepEqual(parsed.levels, { 1: { completed: true, stars: 2, bestPieces: 5 } })
})

test('parseSave: wrong-typed settings fields fall back individually', () => {
  const raw = {
    version: 1,
    levels: {},
    settings: { muted: 'nope', quality: 'ultra-mega', reducedMotion: 1 },
    seenCoach: false,
  }
  const parsed = parseSave(raw)
  assert.equal(parsed.settings.muted, false)
  assert.equal(parsed.settings.quality, 'auto')
  assert.equal(parsed.settings.reducedMotion, false)
})

test('parseSave: missing fields are filled from defaults', () => {
  const parsed = parseSave({})
  assert.deepEqual(parsed, defaultSave())
})

test('parseSave: accepts each known quality tier', () => {
  for (const quality of ['high', 'medium', 'low', 'auto']) {
    const parsed = parseSave({ settings: { quality } })
    assert.equal(parsed.settings.quality, quality)
  }
})

// ---------------------------------------------------------------------------------------------
// loadSave / writeSave

test('loadSave: default save when nothing is stored', () => {
  const storage = new MemoryStorage()
  const save = withStorage(storage, () => loadSave())
  assert.deepEqual(save, defaultSave())
})

test('loadSave: corrupt JSON falls back to default, never throws', () => {
  const storage = new MemoryStorage()
  storage.setItem('domino-topple:v1', '{not json')
  const save = withStorage(storage, () => loadSave())
  assert.deepEqual(save, defaultSave())
})

test('loadSave: a throwing localStorage falls back to default, never throws', () => {
  const throwing = {
    getItem() {
      throw new Error('boom')
    },
    setItem() {
      throw new Error('boom')
    },
  }
  const save = withStorage(throwing, () => loadSave())
  assert.deepEqual(save, defaultSave())
})

test('writeSave then loadSave round-trips', () => {
  const storage = new MemoryStorage()
  const save: SaveData = {
    version: 1,
    levels: { 5: { completed: true, stars: 1, bestPieces: null } },
    settings: { muted: true, quality: 'medium', reducedMotion: false },
    seenCoach: true,
  }
  const ok = withStorage(storage, () => writeSave(save))
  assert.equal(ok, true)
  const loaded = withStorage(storage, () => loadSave())
  assert.deepEqual(loaded, save)
})

test('writeSave: false on a throwing localStorage, never throws', () => {
  const throwing = {
    setItem() {
      throw new Error('boom')
    },
  }
  const ok = withStorage(throwing, () => writeSave(defaultSave()))
  assert.equal(ok, false)
})

// ---------------------------------------------------------------------------------------------
// loadLayout / writeLayout

test('loadLayout: empty array when nothing is stored', () => {
  const storage = new MemoryStorage()
  const layout = withStorage(storage, () => loadLayout(1))
  assert.deepEqual(layout, [])
})

test('loadLayout: corrupt JSON yields empty array', () => {
  const storage = new MemoryStorage()
  storage.setItem('domino-topple:layout:1', 'not json{')
  const layout = withStorage(storage, () => loadLayout(1))
  assert.deepEqual(layout, [])
})

test('writeLayout then loadLayout round-trips valid pieces', () => {
  const storage = new MemoryStorage()
  const placed: PlacedPiece[] = [
    { id: 'p1', kind: 'domino', x: 1, y: 0, z: 2, rotY: 0.1 },
    { id: 'p2', kind: 'marble', x: -3, y: 0, z: 4, rotY: 0 },
  ]
  withStorage(storage, () => writeLayout(1, placed))
  const loaded = withStorage(storage, () => loadLayout(1))
  assert.deepEqual(loaded, placed)
})

test('loadLayout: drops pieces with unknown kind, non-finite numbers, or duplicate ids', () => {
  const storage = new MemoryStorage()
  const raw = [
    { id: 'p1', kind: 'domino', x: 0, y: 0, z: 0, rotY: 0 },
    { id: 'p2', kind: 'not-a-kind', x: 0, y: 0, z: 0, rotY: 0 },
    { id: 'p3', kind: 'domino', x: Number.NaN, y: 0, z: 0, rotY: 0 },
    { id: 'p1', kind: 'domino', x: 5, y: 0, z: 0, rotY: 0 }, // duplicate id
    { id: 'p4', kind: 'pendulum', x: 0, y: 0, z: 0, rotY: 0 }, // fixture kind, not placeable
  ]
  storage.setItem('domino-topple:layout:1', JSON.stringify(raw))
  const layout = withStorage(storage, () => loadLayout(1))
  assert.deepEqual(layout, [{ id: 'p1', kind: 'domino', x: 0, y: 0, z: 0, rotY: 0 }])
})

test('loadLayout: caps at 400 pieces', () => {
  const storage = new MemoryStorage()
  const raw = Array.from({ length: 500 }, (_, i) => ({
    id: `p${i}`,
    kind: 'domino',
    x: 0,
    y: 0,
    z: 0,
    rotY: 0,
  }))
  storage.setItem('domino-topple:layout:1', JSON.stringify(raw))
  const layout = withStorage(storage, () => loadLayout(1))
  assert.equal(layout.length, 400)
})

test('loadLayout: a throwing localStorage yields empty array, never throws', () => {
  const throwing = {
    getItem() {
      throw new Error('boom')
    },
  }
  const layout = withStorage(throwing, () => loadLayout(1))
  assert.deepEqual(layout, [])
})

test('writeLayout: false on a throwing localStorage, never throws', () => {
  const throwing = {
    setItem() {
      throw new Error('boom')
    },
  }
  const ok = withStorage(throwing, () => writeLayout(1, []))
  assert.equal(ok, false)
})

test('parseSave: drops out-of-range stars, negative piece counts and the sandbox id', () => {
  const save = parseSave({
    version: 1,
    levels: {
      0: { completed: true, stars: 3, bestPieces: 4 },
      1: { completed: true, stars: 99, bestPieces: 4 },
      2: { completed: true, stars: 2.5, bestPieces: 4 },
      3: { completed: true, stars: 2, bestPieces: -1 },
      4: { completed: true, stars: 3, bestPieces: 12 },
    },
  })
  assert.deepEqual(Object.keys(save.levels), ['4'])
})
