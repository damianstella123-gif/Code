import type { FlyContext } from './types'

let currentContext: FlyContext = { page: 'dashboard' }

export function setFlyContext(ctx: Partial<FlyContext>) {
  currentContext = { ...currentContext, ...ctx }
}

export function getFlyContext(): FlyContext {
  return currentContext
}
