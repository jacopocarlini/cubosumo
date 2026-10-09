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
import {getConfig} from './constants';
import {Game} from './Game';
import {useInput} from './input';
import {useIsMobile} from './utils';
import BackgroundMusic from './utils/BackgroundMusic';
import {GameState, MenuOverlay, Overlay, gameAudio} from './utils/helper';
import {
  usePlayground,
  usePlaygroundGameLifecycle,
  useRpc,
} from './utils/usePlayground';

export default function App() {
  const isMobile = useIsMobile();
  const isLocalMultiplayer = ['localhost', '127.0.0.1', '::1'].includes(
    window.location.hostname,
  );
  const {sdk, isReady} = usePlayground();
  const [exitChat] = useRpc<Record<string, unknown>, void>('ExitChat');

  const [gameState, setGameState] = useState<GameState>({
    status: 'START',
    score: 0,
    level: 1,
    roundWins: 0,
    roundLosses: 0,
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
    localMultiplayer: isLocalMultiplayer,
  });

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

  const initGame = useCallback(() => {
    gameAudio.playConfirmSelect();
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
    });
    setIsGameMenuOpen(false);
    setIsHowToPlayOpen(false);
    setGameKey((prev) => prev + 1);

    if (sdk) {
      sdk.startGame();
    }
  }, [sdk]);

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
        volume={0.3}
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
                  GIOCATORE
                </span>
                {playerExhausted ? (
                  <span className="text-rose-400 font-extrabold animate-pulse text-[10px]">ESAUSTO (-80%)</span>
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
                  AVVERSARIO
                </span>
                {enemyExhausted ? (
                  <span className="text-rose-400 font-extrabold animate-pulse text-[10px]">ESAUSTO (-80%)</span>
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
              <span>W: {gameState.roundWins || 0}</span>
              <span className="text-rose-400">| L: {gameState.roundLosses || 0}/3</span>
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
          gameState={gameState}
          setGameState={setGameState}
          exitChat={exitChat}
          gameStateRef={gameStateRef}
          inputRef={inputRef}
          localMultiplayer={isLocalMultiplayer}
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

        {/* Dynamic Desktop Controls Hint */}
        {gameState.status === 'PLAYING' && !isMobile && (
          <div className="absolute bottom-4 pointer-events-none z-10 flex flex-col items-center gap-1">
            <div className="bg-slate-900/85 border border-slate-700/80 px-4 py-2 rounded-full text-xs font-semibold text-slate-300 backdrop-blur shadow-xl flex items-center gap-3">
              {isLocalMultiplayer ? (
                <>
                  <span><strong className="text-amber-400">P1 WASD</strong> · <strong className="text-sky-400">C</strong> salta · <strong className="text-rose-400">V</strong> spinta</span>
                  <span className="text-slate-600">|</span>
                  <span><strong className="text-amber-400">P2 Frecce</strong> · <strong className="text-sky-400">,</strong> salta · <strong className="text-rose-400">.</strong> spinta</span>
                </>
              ) : (
                <>
                  <span><strong className="text-amber-400">WASD / Frecce</strong> : Muovi</span>
                  <span className="text-slate-600">|</span>
                  <span><strong className="text-sky-400">SPAZIO</strong> : Salta</span>
                  <span className="text-slate-600">|</span>
                  <span><strong className="text-rose-400">CLICK</strong> : Spinta Sumo</span>
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
                <span className="text-xs font-black tracking-wider">SPINTA</span>
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
                <span className="text-xs font-black tracking-wide">SALTA</span>
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
              Spingi l&apos;avversario fuori dal ring! Usa il <strong>Click</strong> a contatto per la <strong>Spinta Sumo</strong> che lo fa rimbalzare bloccandolo nell&apos;animazione. Fai attenzione alla stamina: a zero perdi l&apos;80% di velocità e il salto per 2 secondi!
            </p>

            <div className="w-full flex flex-col gap-3">
              <button
                onClick={initGame}
                autoFocus
                className="w-full py-3.5 px-6 rounded-xl font-black text-base md:text-lg bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition transform active:scale-95">
                <Play className="w-5 h-5 fill-slate-950" />
                INIZIA PARTITA
              </button>
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="w-full py-2.5 px-6 rounded-xl font-bold text-xs md:text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition">
                <HelpCircle className="w-4 h-4" />
                COME GIOCARE
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
              MENU DI GIOCO
            </h2>

            <div className="w-full flex flex-col gap-3 mb-6">
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsGameMenuOpen(false);
                }}
                autoFocus
                className="w-full py-3 rounded-xl font-black text-base bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-2 cursor-pointer transition">
                <Play className="w-4 h-4 fill-slate-950" />
                RIPRENDI
              </button>

              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  initGame();
                }}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition">
                <RotateCw className="w-4 h-4" />
                RICOMINCIA ROUND
              </button>

              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition">
                <HelpCircle className="w-4 h-4" />
                COME GIOCARE
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
                  SFX: {sfxMuted ? 'MUTO' : 'ATTIVO'}
                </button>
                <button
                  onClick={() => setMusicMuted((prev) => !prev)}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  {musicMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  MUSICA: {musicMuted ? 'MUTA' : 'ATTIVA'}
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                gameAudio.playCrispClick();
                setIsGameMenuOpen(false);
                setGameState((prev) => ({...prev, status: 'START'}));
              }}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer">
              ESCI AL MENU PRINCIPALE
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* HOW TO PLAY OVERLAY */}
      {isHowToPlayOpen && (
        <MenuOverlay tone="neutral" zIndex={70}>
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col items-center text-center">
            <h2 className="text-2xl md:text-3xl font-black text-amber-400 mb-4 uppercase">
              COME GIOCARE
            </h2>
            <div className="text-left text-xs md:text-sm text-slate-300 space-y-3 mb-6">
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="font-bold text-amber-300">🎮 Movimento:</span>
                <p className="mt-0.5 text-slate-300">
                  {isLocalMultiplayer ? (
                    <>Giocatore 1: <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">WASD</kbd>. Giocatore 2: <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">Frecce</kbd>.</>
                  ) : (
                    <>Usa <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">WASD</kbd> o <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">Frecce</kbd> per muoverti.</>
                  )}
                </p>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="font-bold text-rose-400">💥 Spinta Sumo:</span>
                <p className="mt-0.5 text-slate-300">
                  {isLocalMultiplayer ? (
                    <>A contatto, il giocatore 1 preme <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">V</kbd> e il giocatore 2 preme <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">.</kbd>. Consuma stamina e fa rimbalzare l&apos;avversario.</>
                  ) : (
                    <>Fai click quando tocchi l&apos;avversario nella direzione del movimento. Consuma stamina e lo fa rimbalzare.</>
                  )}
                </p>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="font-bold text-sky-300">🦘 Salto:</span>
                <p className="mt-0.5 text-slate-300">
                  {isLocalMultiplayer ? (
                    <>Il giocatore 1 salta con <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">C</kbd>, il giocatore 2 con <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">,</kbd>. Consuma stamina.</>
                  ) : (
                    <>Premi <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-white font-mono">SPAZIO</kbd> quando tocchi il ring o sei sopra l&apos;avversario.</>
                  )}
                </p>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="font-bold text-rose-300">⚠️ Penalità Stamina Esaurita:</span>
                <p className="mt-0.5 text-slate-300">Se finisci la stamina (0%), dura <strong>2 secondi</strong>: velocità ridotta al <strong>20%</strong> e <strong>impossibilità di saltare</strong> (vale per entrambi i cubi!).</p>
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
              CHIUDI
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* GAME OVER SCREEN */}
      {gameState.status === 'GAME_OVER' && (
        <Overlay
          title="SCONFITTA"
          description={`Sei caduto dal ring 3 volte! Punteggio finale: ${gameState.score}`}
          actionLabel="RIGIOCA"
          onAction={initGame}
          icon={<RotateCw size={20} />}
          tone="danger"
        />
      )}

      {/* VICTORY SCREEN */}
      {gameState.status === 'VICTORY' && (
        <Overlay
          title="CAMPIONE DI SUMO!"
          description={`Hai trionfato nel torneo! Punteggio Finale: ${gameState.score}`}
          actionLabel="NUOVA SFIDA"
          onAction={initGame}
          icon={<RotateCw size={20} />}
          tone="victory"
        />
      )}
    </div>
  );
}
