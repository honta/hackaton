import { randomUUID } from 'node:crypto';

export interface PendingState {
  id: string;
  returnTo: string;
  createdAt: number;
  expiresAt: number;
}

export interface BridgeSession {
  id: string;
  athlete: unknown;
  scope: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  createdAt: number;
  expiresAtSession: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 5 * 60 * 1000;

export class MemorySessionStore {
  private readonly states = new Map<string, PendingState>();
  private readonly sessions = new Map<string, BridgeSession>();

  constructor(private readonly now: () => number = Date.now) {}

  createState(returnTo: string): PendingState {
    const state: PendingState = {
      id: randomUUID(),
      returnTo,
      createdAt: this.now(),
      expiresAt: this.now() + STATE_TTL_MS,
    };

    this.states.set(state.id, state);
    return state;
  }

  consumeState(id: string): PendingState | null {
    const value = this.states.get(id);
    this.states.delete(id);

    if (!value || value.expiresAt < this.now()) {
      return null;
    }

    return value;
  }

  createSession(payload: Omit<BridgeSession, 'id' | 'createdAt' | 'expiresAtSession'>): BridgeSession {
    const session: BridgeSession = {
      id: randomUUID(),
      createdAt: this.now(),
      expiresAtSession: this.now() + SESSION_TTL_MS,
      ...payload,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  consumeSession(id: string): BridgeSession | null {
    const value = this.sessions.get(id);
    this.sessions.delete(id);

    if (!value || value.expiresAtSession < this.now()) {
      return null;
    }

    return value;
  }
}
