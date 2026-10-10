import type {ClientMessage} from '../src/multiplayer/protocol.ts';

const inputKeys = ['left', 'right', 'up', 'down', 'jump', 'push'];
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseMessage(text: string): ClientMessage | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!record(value) || typeof value.type !== 'string') return null;
  const keys = Object.keys(value);
  switch (value.type) {
    case 'create':
    case 'queue':
    case 'leave':
    case 'rematch':
      return keys.length === 1 ? value as ClientMessage : null;
    case 'join':
      if (keys.length !== 2 || typeof value.code !== 'string' ||
          !/^[A-Z2-9]{6}$/i.test(value.code)) return null;
      return {type: 'join', code: value.code.toUpperCase()};
    case 'input':
      if (keys.length !== 2 || !record(value.input)) return null;
      if (Object.keys(value.input).length !== inputKeys.length ||
          !inputKeys.every(key => typeof (value.input as Record<string, unknown>)[key] === 'boolean')) return null;
      return value as ClientMessage;
    default:
      return null;
  }
}

export class RateLimit {
  private tokens: number;
  private updated: number;
  constructor(private capacity: number, private perSecond: number, now = Date.now()) {
    this.tokens = capacity;
    this.updated = now;
  }
  take(now = Date.now()) {
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.updated) / 1000 * this.perSecond);
    this.updated = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
