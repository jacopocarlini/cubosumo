// tslint:disable
/* eslint-disable */
import {
  Activity,
  AlertTriangle,
  Award,
  Gamepad2,
  HelpCircle,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AI_DIFFICULTY_SPEED_RATIOS, getConfig} from './constants';
import {Game} from './Game';
import {useInput} from './input';
import {OnlineLobby} from './multiplayer/OnlineLobby';
import {useOnline} from './multiplayer/useOnline';
import type {MatchSnapshot} from './multiplayer/protocol';
import {getViewFighters} from './multiplayer/perspective';
import {useIsMobile} from './utils';
import BackgroundMusic from './utils/BackgroundMusic';
import {MenuOverlay, Overlay, gameAudio} from './utils/helper';
import {
  type CpuDifficulty,
  type GameMode,
  type GameState,
} from './utils/helper';
import {
  usePlayground,
  usePlaygroundGameLifecycle,
  useRpc,
} from './utils/usePlayground';

const CPU_DIFFICULTIES: {value: CpuDifficulty; label: string}[] = [
  {value: 'easy', label: 'EASY'},
  {value: 'normal', label: 'NORMAL'},
  {value: 'hard', label: 'HARD'},
];

export default function App() {
  const isMobile = useIsMobile();
  const {sdk, isReady} = usePlayground();
  const [exitChat] = useRpc<Record<string, unknown>, void>('ExitChat');
  const [gameMode, setGameMode] = useState<GameMode>('single-player');
  const [cpuDifficulty, setCpuDifficulty] = useState<CpuDifficulty>('normal');
  const [startMenuStep, setStartMenuStep] = useState<'mode' | 'difficulty' | 'online'>('mode');

  const [gameState, setGameState] = useState<GameState>({
    status: 'START',
    score: 0,
    level: 1,
    roundWins: 0,
    roundLosses: 0,
    mode: 'single-player',
    cpuDifficulty: 'normal',
    playerLives: 3,
    opponentLives: 3,
  });

  const [playerStamina, setPlayerStamina] = useState(100);
  const [playerExhausted, setPlayerExhausted] = useState(false);
  const [enemyStamina, setEnemyStamina] = useState(100);
  const [enemyExhausted, setEnemyExhausted] = useState(false);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const [gameKey, setGameKey] = useState(0);
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);

  // Unified Input
  const appContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useInput(appContainerRef, {
    enabled: gameState.status === 'PLAYING' && !isGameMenuOpen && !isHowToPlayOpen,
    gameMode,
  });
  const online = useOnline(inputRef, gameState.status === 'PLAYING' && !isGameMenuOpen && !isHowToPlayOpen);
  const isOnline = gameMode === 'online-multiplayer';
  const previousOnlineSnapshot = useRef<MatchSnapshot | null>(null);

  useEffect(() => {
    const previous = previousOnlineSnapshot.current;
    const snapshot = online.snapshot;
    previousOnlineSnapshot.current = snapshot;
    if (!snapshot || !previous || snapshot.roomCode !== previous.roomCode || online.room === null) return;
    const seat = online.room.seat;
    if (snapshot.players.some((fighter, index) => fighter.stunned && !previous.players[index].stunned)) {
      gameAudio.playGunshotBlast();
    }
    if (snapshot.players[seat].exhausted && !previous.players[seat].exhausted) {
      gameAudio.playErrorBuzz();
    }
    if (snapshot.players[seat].lives < previous.players[seat].lives) {
      gameAudio.playDefeatMotif();
    } else if (snapshot.players[1 - seat].lives < previous.players[1 - seat].lives) {
      gameAudio.playVictoryFanfare();
    }
  }, [online.snapshot, online.room]);

  useEffect(() => {
    if (!isOnline) return;
    const snapshot = online.snapshot;
    if (!snapshot || snapshot.phase === 'waiting') {
      setGameState((prev) => prev.status === 'START' ? prev : {...prev, status: 'START'});
      setStartMenuStep('online');
      setIsGameMenuOpen(false);
      if (!snapshot) setIsHowToPlayOpen(false);
      return;
    }
    if (snapshot.phase === 'finished') {
      setIsGameMenuOpen(false);
      setIsHowToPlayOpen(false);
    }
    const [local, opponent] = getViewFighters(snapshot, online.room?.seat ?? 0);
    setGameState((prev) => ({
      ...prev,
      mode: 'online-multiplayer',
      status: snapshot.phase === 'finished'
        ? snapshot.winner === online.room?.seat ? 'VICTORY' : 'GAME_OVER'
        : 'PLAYING',
      level: snapshot.round,
      playerLives: local.lives,
      opponentLives: opponent.lives,
    }));
    setPlayerStamina(Math.round(local.stamina));
    setEnemyStamina(Math.round(opponent.stamina));
    setPlayerExhausted(local.exhausted);
    setEnemyExhausted(opponent.exhausted);
  }, [isOnline, online.snapshot, online.room?.seat]);

  const leaveOnline = () => {
    online.disconnect();
    setIsGameMenuOpen(false);
    setIsHowToPlayOpen(false);
    setStartMenuStep('mode');
    setGameMode('single-player');
    setGameState((prev) => ({...prev, status: 'START', mode: 'single-player'}));
    setGameKey((prev) => prev + 1);
  };

  useEffect(() => {
    (window as unknown as Record<string, unknown>).canHandleBackKey = [
      'PLAYING',
      'PAUSED',
    ].includes(gameState.status);
  }, [gameState.status]);

  // Keyboard shortcut for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isHowToPlayOpen) {
          setIsHowToPlayOpen(false);
        } else if (gameState.status === 'PLAYING') {
          setIsGameMenuOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.status, isHowToPlayOpen]);

  const initGame = useCallback(
    (mode: GameMode = gameMode, difficulty: CpuDifficulty = cpuDifficulty) => {
      if (mode === 'online-multiplayer') return;
      gameAudio.playConfirmSelect();
      setGameMode(mode);
      setCpuDifficulty(difficulty);
      setPlayerStamina(100);
      setPlayerExhausted(false);
      setEnemyStamina(100);
      setEnemyExhausted(false);
      setGameState({
        status: 'PLAYING',
        score: 0,
        level: 1,
        roundWins: 0,
        roundLosses: 0,
        mode,
        cpuDifficulty: difficulty,
        playerLives: 3,
        opponentLives: 3,
      });
      setStartMenuStep('mode');
      setIsGameMenuOpen(false);
      setIsHowToPlayOpen(false);
      setGameKey((prev) => prev + 1);

      if (sdk) {
        sdk.startGame();
      }
    },
    [cpuDifficulty, gameMode, sdk],
  );

  // PLAYGROUND SDK Integration
  usePlaygroundGameLifecycle(gameState, sdk);

  // Mobile virtual controls helpers
  const handleMobileDir = (dir: 'left' | 'right' | 'up' | 'down', active: boolean) => {
    if (inputRef.current) {
      inputRef.current.actions[dir] = active;
    }
  };

  const handleMobileJump = (active: boolean) => {
    if (inputRef.current) {
      inputRef.current.actions.jump = active;
    }
  };

  const handleMobileSumoPush = () => {
    if (inputRef.current) {
      inputRef.current.actions.confirm = true;
      setTimeout(() => {
        if (inputRef.current) inputRef.current.actions.confirm = false;
      }, 100);
    }
  };

  const isMusicPlaying =
    ['PLAYING', 'PAUSED'].includes(gameState.status) && !isGameMenuOpen && !musicMuted;

  return (
    <div
      ref={appContainerRef}
      className="fixed inset-0 overflow-hidden touch-none flex flex-col bg-slate-950 text-white font-sans select-none">
      <BackgroundMusic
        url={getConfig('backgroundMusicUrl')}
        isPlaying={isMusicPlaying}
        isMuted={musicMuted}
        volume={0.12}
      />

      {/* Top Header / HUD Bar */}
      {gameState.status === 'PLAYING' && (
        <div className="w-full flex items-center justify-between px-3 md:px-5 py-2 bg-slate-900/85 border-b border-slate-800 backdrop-blur z-20 shrink-0 gap-2">
          {/* Round & Score */}
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg text-xs md:text-sm font-bold border border-amber-500/30">
              <Award className="w-3.5 h-3.5" />
              <span>ROUND {gameState.level}</span>
            </div>
            <div className="text-xs md:text-sm font-black text-white tracking-wide hidden sm:block">
              SCORE: <span className="text-amber-400">{gameState.score}</span>
            </div>
          </div>

          {/* Center Dual Stamina Bars: Player & Enemy */}
          <div className="flex-1 max-w-xl flex items-center justify-center gap-3 md:gap-6 px-1">
            {/* Player Stamina (Blue) */}
            <div className="flex-1 flex flex-col gap-0.5 max-w-[170px] md:max-w-[210px]">
              <div className="flex justify-between items-center text-[10px] md:text-xs font-bold text-sky-400">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-sky-400" />
                  {isOnline ? 'YOU' : gameMode === 'local-multiplayer' ? 'PLAYER 1' : 'PLAYER'}
                  {gameMode !== 'single-player' && (
                    <span className="ml-1 text-slate-300">
                      {gameState.playerLives ?? 3} ♥
                    </span>
                  )}
                </span>
                {playerExhausted ? (
                  <span className="text-rose-400 font-extrabold animate-pulse text-[10px]">EXHAUSTED (-80%)</span>
                ) : (
                  <span className="font-mono text-slate-300">{playerStamina}%</span>
                )}
              </div>
              <div className="w-full bg-slate-800 border border-slate-700 h-2.5 md:h-3 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    playerExhausted
                      ? 'bg-rose-500'
                      : playerStamina > 35
                      ? 'bg-gradient-to-r from-sky-500 to-cyan-400'
                      : 'bg-rose-500'
                  }`}
                  style={{width: `${Math.max(0, Math.min(100, playerStamina))}%`}}
                />
              </div>
            </div>

            {/* VS Divider */}
            <span className="text-[10px] md:text-xs font-black text-slate-500">VS</span>

            {/* Enemy Stamina (Red) */}
            <div className="flex-1 flex flex-col gap-0.5 max-w-[170px] md:max-w-[210px]">
              <div className="flex justify-between items-center text-[10px] md:text-xs font-bold text-rose-400">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-rose-400" />
                  {isOnline ? 'OPPONENT' : gameMode === 'local-multiplayer' ? 'PLAYER 2' : 'CPU'}
                  {gameMode !== 'single-player' && (
                    <span className="ml-1 text-slate-300">
                      {gameState.opponentLives ?? 3} ♥
                    </span>
                  )}
                </span>
                {enemyExhausted ? (
                  <span className="text-rose-400 font-extrabold animate-pulse text-[10px]">EXHAUSTED (-80%)</span>
                ) : (
                  <span className="font-mono text-slate-300">{enemyStamina}%</span>
                )}
              </div>
              <div className="w-full bg-slate-800 border border-slate-700 h-2.5 md:h-3 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    enemyExhausted
                      ? 'bg-rose-500'
                      : enemyStamina > 35
                      ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{width: `${Math.max(0, Math.min(100, enemyStamina))}%`}}
                />
              </div>
            </div>
          </div>

          {/* Menu Button & Rounds */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1 text-[11px] font-bold text-slate-300 mr-1">
              {gameMode === 'single-player' && (
                <>
                  <span>W: {gameState.roundWins || 0}</span>
                  <span className="text-rose-400">| L: {gameState.roundLosses || 0}/3</span>
                </>
              )}
            </div>

            <button
              onClick={() => {
                gameAudio.playCrispClick();
                setIsGameMenuOpen(true);
              }}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-bold transition border border-slate-700 cursor-pointer min-h-[36px] flex items-center justify-center">
              MENU
            </button>
          </div>
        </div>
      )}

      {/* 3D Canvas Viewport */}
      <div className="flex-1 w-full min-h-0 relative flex items-center justify-center">
        <Game
          key={gameKey}
          onlineSnapshot={online.snapshot}
          onlineSeat={online.room?.seat ?? 0}
          gameState={gameState}
          setGameState={setGameState}
          exitChat={exitChat}
          gameStateRef={gameStateRef}
          inputRef={inputRef}
          gameMode={gameMode}
          cpuDifficulty={cpuDifficulty}
          isPaused={isGameMenuOpen || isHowToPlayOpen}
          playerStamina={playerStamina}
          setPlayerStamina={setPlayerStamina}
          playerExhausted={playerExhausted}
          setPlayerExhausted={setPlayerExhausted}
          enemyStamina={enemyStamina}
          setEnemyStamina={setEnemyStamina}
          enemyExhausted={enemyExhausted}
          setEnemyExhausted={setEnemyExhausted}
        />

        {isOnline && gameState.status === 'PLAYING' && online.snapshot?.phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="rounded-2xl bg-slate-900/90 px-8 py-6 text-center border border-amber-500/50">
              <p className="text-2xl font-black text-amber-300">GET READY</p>
              <p className="text-5xl font-black mt-2">{online.snapshot?.countdown}</p>
              <p className="mt-2 text-sm">You are BLUE · Opponent is RED</p>
            </div>
          </div>
        )}

        {/* Dynamic Desktop Controls Hint */}
        {gameState.status === 'PLAYING' && !isMobile && (
          <div className="absolute bottom-4 pointer-events-none z-10 flex flex-col items-center gap-1">
            <div className="bg-slate-900/85 border border-slate-700/80 px-4 py-2 rounded-full text-xs font-semibold text-slate-300 backdrop-blur shadow-xl flex items-center gap-3">
              {gameMode === 'local-multiplayer' ? (
                <>
                  <span><strong className="text-amber-400">P1 WASD</strong> · <strong className="text-sky-400">C</strong> jump · <strong className="text-rose-400">V</strong> push</span>
                  <span className="text-slate-600">|</span>
                  <span><strong className="text-amber-400">P2 Arrows</strong> · <strong className="text-sky-400">,</strong> jump · <strong className="text-rose-400">.</strong> push</span>
                </>
              ) : (
                <>
                  <span><strong className="text-amber-400">WASD</strong> : Move</span>
                  <span className="text-slate-600">|</span>
                  <span><strong className="text-sky-400">SPACE</strong> : Jump</span>
                  <span className="text-slate-600">|</span>
                  <span><strong className="text-rose-400">CLICK</strong> : Sumo Push</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Dedicated Mobile On-Screen Controls */}
        {gameState.status === 'PLAYING' && isMobile && (
          <div className="absolute inset-0 pointer-events-none z-30 flex justify-between items-end p-4 pb-6">
            {/* D-Pad on Left */}
            <div className="pointer-events-auto flex flex-col items-center gap-1 select-none touch-none ml-1">
              <button
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  handleMobileDir('up', true);
                }}
                onPointerUp={() => handleMobileDir('up', false)}
                onPointerCancel={() => handleMobileDir('up', false)}
                className="w-12 h-12 bg-slate-800/90 active:bg-amber-500 border border-slate-600 active:border-amber-300 rounded-xl text-white font-bold flex items-center justify-center shadow-lg active:scale-95 transition-transform text-lg">
                ▲
              </button>
              <div className="flex gap-1.5">
                <button
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleMobileDir('left', true);
                  }}
                  onPointerUp={() => handleMobileDir('left', false)}
                  onPointerCancel={() => handleMobileDir('left', false)}
                  className="w-12 h-12 bg-slate-800/90 active:bg-amber-500 border border-slate-600 active:border-amber-300 rounded-xl text-white font-bold flex items-center justify-center shadow-lg active:scale-95 transition-transform text-lg">
                  ◀
                </button>
                <button
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleMobileDir('down', true);
                  }}
                  onPointerUp={() => handleMobileDir('down', false)}
                  onPointerCancel={() => handleMobileDir('down', false)}
                  className="w-12 h-12 bg-slate-800/90 active:bg-amber-500 border border-slate-600 active:border-amber-300 rounded-xl text-white font-bold flex items-center justify-center shadow-lg active:scale-95 transition-transform text-lg">
                  ▼
                </button>
                <button
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleMobileDir('right', true);
                  }}
                  onPointerUp={() => handleMobileDir('right', false)}
                  onPointerCancel={() => handleMobileDir('right', false)}
                  className="w-12 h-12 bg-slate-800/90 active:bg-amber-500 border border-slate-600 active:border-amber-300 rounded-xl text-white font-bold flex items-center justify-center shadow-lg active:scale-95 transition-transform text-lg">
                  ▶
                </button>
              </div>
            </div>

            {/* Action Buttons on Right: Push & Jump */}
            <div className="pointer-events-auto flex items-end gap-2 select-none touch-none mr-1">
              <button
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  handleMobileSumoPush();
                }}
                className="w-16 h-16 bg-gradient-to-br from-rose-500 to-amber-600 active:from-rose-400 active:to-amber-500 border-2 border-rose-300 rounded-2xl text-white font-black flex flex-col items-center justify-center shadow-xl active:scale-90 transition-transform">
                <span className="text-xs font-black tracking-wider">PUSH</span>
                <span className="text-[9px] text-rose-200">SUMO</span>
              </button>

              <button
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  handleMobileJump(true);
                }}
                onPointerUp={() => handleMobileJump(false)}
                onPointerCancel={() => handleMobileJump(false)}
                className="w-16 h-16 bg-gradient-to-br from-sky-500 to-blue-600 active:from-sky-400 active:to-blue-500 border-2 border-sky-300 rounded-2xl text-white font-black flex flex-col items-center justify-center shadow-xl active:scale-90 transition-transform">
                <span className="text-xs font-black tracking-wide">JUMP</span>
                <span className="text-[9px] text-sky-200">SPACE</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* START SCREEN */}
      {gameState.status === 'START' && (
        <MenuOverlay tone="neutral" zIndex={50}>
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col items-center text-center backdrop-blur">
            <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-center justify-center mb-4 text-amber-400">
              <Gamepad2 className="w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-amber-400 mb-2 uppercase tracking-wide">
              {getConfig('title')}
            </h1>
            <p className="text-slate-300 text-xs md:text-sm mb-6 leading-relaxed">
              Push your opponent out of the ring! Click while in contact to unleash a <strong>Sumo Push</strong> that sends them flying. Watch your stamina: when it runs out, your speed drops to <strong>20%</strong> and you can&apos;t jump or push for 2 seconds!
            </p>

            <div className="w-full flex flex-col gap-3">
              {startMenuStep === 'online' ? (
                <OnlineLobby online={online} onBack={leaveOnline} />
              ) : startMenuStep === 'mode' ? (
                <>
                  <button
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setGameMode('single-player');
                      setStartMenuStep('difficulty');
                    }}
                    autoFocus
                    className="w-full py-3.5 px-6 rounded-xl font-black text-base md:text-lg bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition transform active:scale-95">
                    <Play className="w-5 h-5 fill-slate-950" />
                    SINGLE PLAYER VS CPU
                  </button>
                  <button
                    onClick={() => initGame('local-multiplayer')}
                    className="w-full py-3 px-6 rounded-xl font-black text-sm md:text-base bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 cursor-pointer transition">
                    LOCAL MULTIPLAYER
                  </button>
                  <button
                    onClick={() => {
                      setGameMode('online-multiplayer');
                      setGameState((prev) => ({...prev, score: 0, level: 1, roundWins: 0, roundLosses: 0, playerLives: 3, opponentLives: 3}));
                      setStartMenuStep('online');
                    }}
                    className="w-full py-3 px-6 rounded-xl font-black text-sm md:text-base bg-sky-900 hover:bg-sky-800 text-sky-100 border border-sky-700 cursor-pointer transition">
                    ONLINE MULTIPLAYER
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-black text-slate-100">
                    CHOOSE CPU DIFFICULTY
                  </h2>
                  {CPU_DIFFICULTIES.map(({value, label}) => (
                    <button
                      key={value}
                      onClick={() => initGame('single-player', value)}
                      className="w-full py-3 px-6 rounded-xl font-black text-sm md:text-base bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 cursor-pointer transition flex items-center justify-between">
                      <span>{label}</span>
                      <span className="text-xs text-amber-300">
                        {Math.round(AI_DIFFICULTY_SPEED_RATIOS[value] * 100)}% SPEED
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => setStartMenuStep('mode')}
                    className="w-full py-2.5 px-6 rounded-xl font-bold text-xs md:text-sm text-slate-300 hover:text-white cursor-pointer transition">
                    BACK TO MODES
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="w-full py-2.5 px-6 rounded-xl font-bold text-xs md:text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition">
                <HelpCircle className="w-4 h-4" />
                HOW TO PLAY
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* GAME MENU / PAUSE OVERLAY */}
      {isGameMenuOpen && (
        <MenuOverlay tone="neutral" zIndex={60}>
          <div className="w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col items-center text-center">
            <h2 className="text-2xl md:text-4xl font-black text-amber-400 mb-6 uppercase tracking-wider">
              GAME MENU
            </h2>
            {isOnline && <p className="text-sm text-amber-300 mb-4">Online matches keep running while this menu is open.</p>}

            <div className="w-full flex flex-col gap-3 mb-6">
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsGameMenuOpen(false);
                }}
                autoFocus
                className="w-full py-3 rounded-xl font-black text-base bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-2 cursor-pointer transition">
                <Play className="w-4 h-4 fill-slate-950" />
                RESUME
              </button>

              {!isOnline && <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  initGame();
                }}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition">
                <RotateCw className="w-4 h-4" />
                RESTART ROUND
              </button>}

              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition">
                <HelpCircle className="w-4 h-4" />
                HOW TO PLAY
              </button>

              {/* Audio Controls */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => {
                    const muted = gameAudio.toggleMute();
                    setSfxMuted(muted);
                  }}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  {sfxMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  SFX: {sfxMuted ? 'MUTED' : 'ON'}
                </button>
                <button
                  onClick={() => setMusicMuted((prev) => !prev)}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  {musicMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  MUSIC: {musicMuted ? 'MUTED' : 'ON'}
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                gameAudio.playCrispClick();
                if (isOnline) {
                  leaveOnline();
                  return;
                }
                setIsGameMenuOpen(false);
                setStartMenuStep('mode');
                setGameState((prev) => ({...prev, status: 'START'}));
              }}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer">
              EXIT TO MAIN MENU
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* HOW TO PLAY OVERLAY */}
      {isHowToPlayOpen && (
        <MenuOverlay tone="neutral" zIndex={70}>
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col items-center text-center">
            <h2 className="text-2xl md:text-3xl font-black text-amber-400 mb-4 uppercase">
              HOW TO PLAY
            </h2>
            <div className="text-left text-xs md:text-sm text-slate-300 space-y-3 mb-6">
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="font-bold text-amber-300">🎮 Movement:</span>
                <p className="mt-0.5 text-slate-300">
                  {gameMode === 'local-multiplayer' ? (
                    <>Player 1: <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">WASD</kbd>. Player 2: <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">Arrow keys</kbd>.</>
                  ) : (
                    <>Use <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">WASD</kbd> to move.</>
                  )}
                </p>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="font-bold text-rose-400">💥 Sumo Push:</span>
                <p className="mt-0.5 text-slate-300">
                  {gameMode === 'local-multiplayer' ? (
                    <>When in contact, Player 1 presses <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">V</kbd> and Player 2 presses <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">.</kbd>. It uses stamina and sends the opponent flying.</>
                  ) : (
                    <>Click while touching your opponent to push them in your current movement direction. It uses stamina and sends them flying.</>
                  )}
                </p>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="font-bold text-sky-300">🦘 Jump:</span>
                <p className="mt-0.5 text-slate-300">
                  {gameMode === 'local-multiplayer' ? (
                    <>Player 1 jumps with <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">C</kbd>, and Player 2 with <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">,</kbd>. Press again in midair to double jump. Each jump uses stamina.</>
                  ) : (
                    <>Press <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">SPACE</kbd> on the ground or on top of your opponent, then press again in midair to double jump. Each jump uses stamina.</>
                  )}
                </p>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="font-bold text-rose-300">⚠️ Exhaustion:</span>
                <p className="mt-0.5 text-slate-300">When your stamina reaches 0%, exhaustion lasts <strong>2 seconds</strong>: your speed drops to <strong>20%</strong> and you <strong>can&apos;t jump or push</strong> (this applies to both cubes!). Cubes also sweat when they don&apos;t have enough stamina for an action.</p>
              </div>
            </div>

            <button
              onClick={() => {
                gameAudio.playCrispClick();
                setIsHowToPlayOpen(false);
              }}
              autoFocus
              className="w-full py-3 rounded-xl font-black text-base bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-2 cursor-pointer transition">
              <X className="w-5 h-5" />
              CLOSE
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* GAME OVER SCREEN */}
      {isOnline && online.snapshot?.phase === 'finished' && (
        <MenuOverlay tone={online.snapshot.winner === online.room?.seat ? 'victory' : 'danger'} zIndex={55}>
          <div className="w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 text-center flex flex-col gap-4">
            <h2 className="text-3xl font-black text-amber-300">{online.snapshot.winner === null ? 'DRAW' : online.snapshot.winner === online.room?.seat ? 'YOU WIN!' : 'DEFEAT'}</h2>
            <p className="text-slate-300">Both players must agree to a rematch.</p>
            <button
              disabled={online.snapshot.rematch[online.room?.seat ?? 0]}
              onClick={() => {
                setIsGameMenuOpen(false);
                setIsHowToPlayOpen(false);
                online.send({type: 'rematch'});
              }}
              className="rounded-xl bg-amber-400 text-slate-950 py-3 font-black disabled:opacity-50 cursor-pointer">
              {online.snapshot.rematch[online.room?.seat ?? 0] ? 'WAITING FOR OPPONENT...' : 'REMATCH'}
            </button>
            {online.notice && <p role="alert" className="text-rose-300">{online.notice}</p>}
            <button onClick={leaveOnline} className="text-slate-300 py-2 font-bold cursor-pointer">MAIN MENU</button>
          </div>
        </MenuOverlay>
      )}

      {!isOnline && gameState.status === 'GAME_OVER' && (
        <Overlay
          title={gameMode === 'local-multiplayer' ? 'PLAYER 1 DEFEATED' : 'DEFEAT'}
          description={
            gameMode === 'local-multiplayer'
              ? 'Player 1 ran out of lives.'
              : `You fell out of the ring 3 times! Final score: ${gameState.score}`
          }
          actionLabel="PLAY AGAIN"
          onAction={() => initGame()}
          icon={<RotateCw size={20} />}
          tone="danger"
        />
      )}

      {/* VICTORY SCREEN */}
      {!isOnline && gameState.status === 'VICTORY' && (
        <Overlay
          title={gameMode === 'local-multiplayer' ? 'PLAYER 1 WINS!' : 'SUMO CHAMPION!'}
          description={
            gameMode === 'local-multiplayer'
              ? 'Player 2 ran out of lives.'
              : `You won the tournament! Final score: ${gameState.score}`
          }
          actionLabel="NEW CHALLENGE"
          onAction={() => initGame()}
          icon={<RotateCw size={20} />}
          tone="victory"
        />
      )}
    </div>
  );
}
