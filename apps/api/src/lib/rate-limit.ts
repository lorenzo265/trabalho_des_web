import type { Clock } from '../clock';

/** Janela deslizante em memória (suficiente para o PoC local). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: Clock,
  ) {}

  private recent(key: string): number[] {
    const cutoff = this.clock().getTime() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Segundos até poder tentar de novo, ou `null` se ainda há folga. */
  retryAfter(key: string): number | null {
    const list = this.recent(key);
    if (list.length < this.max) return null;
    const oldest = list[0]!;
    return Math.max(1, Math.ceil((oldest + this.windowMs - this.clock().getTime()) / 1000));
  }

  hit(key: string): void {
    const list = this.recent(key);
    list.push(this.clock().getTime());
    this.hits.set(key, list);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
