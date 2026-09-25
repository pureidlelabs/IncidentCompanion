/**
 * Allowances that refill at a steady rate, one per key.
 */

/** What a take answers: taken, or refused -- `first` when the refusal starts a run. */
export type Taken = 'taken' | 'first' | 'refused'

export class Allowances {
  private readonly held = new Map<string, { left: number; at: number }>()
  /** Keys refused since their last take, so a run of refusals is told once. */
  private readonly refusing = new Set<string>()

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {}

  take(key: string, amount = 1): Taken {
    const now = Date.now()
    const was = this.held.get(key)
    const left = was ? Math.min(this.capacity, was.left + ((now - was.at) / 1000) * this.perSecond) : this.capacity
    if (left < amount) {
      this.held.set(key, { left, at: now })
      if (this.refusing.has(key)) return 'refused'
      this.refusing.add(key)
      return 'first'
    }
    this.held.set(key, { left: left - amount, at: now })
    this.refusing.delete(key)
    return 'taken'
  }

  /** Forgets every key whose allowance has refilled, which is the same as never having taken. */
  forgetFull(): void {
    const now = Date.now()
    for (const [key, was] of this.held) {
      if (was.left + ((now - was.at) / 1000) * this.perSecond >= this.capacity) {
        this.held.delete(key)
        this.refusing.delete(key)
      }
    }
  }
}
