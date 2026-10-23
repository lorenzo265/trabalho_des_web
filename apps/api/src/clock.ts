/** Relógio injetável: testes controlam o tempo; produção usa `new Date()`. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

/** Relógio manual para testes. */
export class FakeClock {
  private t: number;
  constructor(start: string | Date) {
    this.t = new Date(start).getTime();
  }
  now = (): Date => new Date(this.t);
  advance(ms: number): void {
    this.t += ms;
  }
  set(to: string | Date): void {
    this.t = new Date(to).getTime();
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
