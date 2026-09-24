/*
 * Hash-based routing: '#/' (or empty) is the menu, '#/level/<id>' a campaign level (id must be a
 * positive integer present in LEVELS, else the menu), '#/sandbox' the sandbox table.
 */

import { LEVELS } from './levels/index.ts'
import type { Route } from './types.ts'

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  if (path === '' || path === '/') return { name: 'menu' }
  if (path === '/sandbox') return { name: 'sandbox' }
  const match = /^\/level\/(\d+)$/.exec(path)
  if (match) {
    const id = Number(match[1])
    if (Number.isInteger(id) && id > 0 && LEVELS.some((level) => level.id === id)) {
      return { name: 'level', id }
    }
  }
  return { name: 'menu' }
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/'
    case 'sandbox':
      return '#/sandbox'
    case 'level':
      return `#/level/${route.id}`
  }
}
