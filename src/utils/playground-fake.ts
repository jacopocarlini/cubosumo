// tslint:disable
/* eslint-disable */
export class FakePlaygroundSDK {
  private isInitialized = false;
  private onGameEvent: ((event: any) => void) | null = null;
  private onPlayerPresence: ((presence: any) => void) | null = null;
  private onLobbyStatus: ((status: any) => void) | null = null;
  private onError: ((error: any) => void) | null = null;

  private lobbyId = 'fake-lobby-123';
  private gameId = 'fake-game-456';
  private myPlayerId = 'player-1';
  private isHost = true;
  private players: any[] = [];
  private playersCount = 1;

  async init(
    onGameEvent: (event: any) => void,
    onPlayerPresence: (presence: any) => void,
    onLobbyStatus?: (status: any) => void,
    onError?: (error: any) => void,
  ): Promise<void> {
    this.onGameEvent = onGameEvent;
    this.onPlayerPresence = onPlayerPresence;
    if (onLobbyStatus) this.onLobbyStatus = onLobbyStatus;
    if (onError) this.onError = onError;
    this.isInitialized = true;

    this.players = [
      {
        playerId: 'player-1',
        displayName: 'Player 1',
        isCurrentPlayer: true,
        isHost: true,
        score: 0,
      },
    ];

    if (this.onPlayerPresence) {
      this.onPlayerPresence({
        action: 'JOIN',
        status: 'SUCCESS',
        player: this.players[0],
      });
    }
  }

  createLobby(callback: (lobbyInfo: any) => void): void {
    setTimeout(() => callback({lobbyId: this.lobbyId, state: 'WAITING_FOR_PLAYERS'}), 100);
  }

  getLobby(arg1: any, arg2?: any): void {
    const callback = typeof arg1 === 'function' ? arg1 : arg2;
    if (typeof callback === 'function') {
      setTimeout(() => callback({lobbyId: this.lobbyId, state: 'GAME_IN_PROGRESS'}), 100);
    }
  }

  updatePlayerPresence(arg1: any, arg2?: any): void {
    const callback = typeof arg1 === 'function' ? arg1 : arg2;
    if (typeof callback === 'function') {
      setTimeout(() => callback(true), 100);
    }
  }

  startGame(): void {
    if (this.onLobbyStatus) {
      this.onLobbyStatus({status: 'GAME_IN_PROGRESS', lobbyId: this.lobbyId});
    }
  }

  sendGameEvent(eventData: any): void {}
  scoreUpdated(scoreData: any): void {}
  levelComplete(level: number | string): void {}
  gameOver(lobbyId?: string): void {
    if (this.onLobbyStatus) {
      this.onLobbyStatus({status: 'GAME_ENDED', lobbyId: this.lobbyId});
    }
  }
  pauseStateChanged(isPaused: boolean): void {}
  showLeaderboard(): void {}
}
