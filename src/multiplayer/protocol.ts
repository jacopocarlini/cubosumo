export interface OnlineInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  push: boolean;
}

export interface FighterSnapshot {
  position: {x: number; y: number; z: number};
  rotation: {x: number; y: number; z: number; w: number};
  stamina: number;
  exhausted: boolean;
  stunned: boolean;
  rejectedActions: number;
  lives: number;
}

export interface MatchSnapshot {
  type: 'snapshot';
  roomCode: string;
  phase: 'waiting' | 'countdown' | 'playing' | 'round-over' | 'finished';
  players: [FighterSnapshot, FighterSnapshot];
  width: number;
  length: number;
  round: number;
  winner: 0 | 1 | null;
  countdown: number;
  rematch: [boolean, boolean];
}

export type ClientMessage =
  | {type: 'create'}
  | {type: 'join'; code: string}
  | {type: 'queue'}
  | {type: 'leave'}
  | {type: 'input'; input: OnlineInput}
  | {type: 'rematch'};

export type ServerMessage =
  | MatchSnapshot
  | {type: 'room'; code: string; seat: 0 | 1}
  | {type: 'queued'}
  | {type: 'left'}
  | {type: 'opponent-left'}
  | {type: 'error'; message: string};
