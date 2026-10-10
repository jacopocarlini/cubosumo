import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {Bloom, EffectComposer} from '@react-three/postprocessing';
import {CuboidCollider, Physics, RapierRigidBody, RigidBody, useRapier} from '@react-three/rapier';
import React, {Suspense, useEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {AI_DIFFICULTY_SPEED_RATIOS, getConfig} from './constants';
import type {InputSnapshot} from './input';
import {gameAudio} from './utils/helper';
import type {CpuDifficulty, GameMode, GameState} from './utils/helper';

interface GameProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  exitChat: (payload: Record<string, unknown>) => Promise<void>;
  gameStateRef: React.MutableRefObject<GameState>;
  inputRef: React.MutableRefObject<InputSnapshot>;
  gameMode: GameMode;
  cpuDifficulty: CpuDifficulty;
  isPaused: boolean;
  playerStamina: number;
  setPlayerStamina: React.Dispatch<React.SetStateAction<number>>;
  playerExhausted: boolean;
  setPlayerExhausted: React.Dispatch<React.SetStateAction<boolean>>;
  enemyStamina: number;
  setEnemyStamina: React.Dispatch<React.SetStateAction<number>>;
  enemyExhausted: boolean;
  setEnemyExhausted: React.Dispatch<React.SetStateAction<boolean>>;
}

// Temporary calculation vectors
const playerMoveDir = new THREE.Vector3();
const enemyMoveDir = new THREE.Vector3();
const scratchVec = new THREE.Vector3();

// Stylized Sumo Cube Component
interface SumoCubeMeshProps {
  color: string;
  beltColor: string;
  isPlayer?: boolean;
  isExhausted?: boolean;
  isStunned?: boolean;
  isSweating?: boolean;
}

function SumoCubeVisual({
  color,
  beltColor,
  isPlayer = false,
  isExhausted = false,
  isStunned = false,
  isSweating = false,
}: SumoCubeMeshProps) {
  return (
    <group>
      {/* Main Cube Body */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial
          color={isStunned ? '#f59e0b' : isExhausted ? '#64748b' : color}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>

      {/* Mawashi Sumo Belt */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[1.56, 0.45, 1.56]} />
        <meshStandardMaterial color={beltColor} roughness={0.4} />
      </mesh>

      {/* Belt Knot Front/Back */}
      <mesh position={[0, 0.65, 0.8]} castShadow>
        <boxGeometry args={[0.4, 0.35, 0.15]} />
        <meshStandardMaterial color={beltColor} roughness={0.4} />
      </mesh>

      {/* Chonmage (Sumo Topknot Hair) */}
      <group position={[0, 1.55, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.2, 0.28, 0.3, 8]} />
          <meshStandardMaterial color="#1e1b4b" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.22, 0.1]} rotation={[-0.4, 0, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.12, 0.35, 8]} />
          <meshStandardMaterial color="#0f172a" roughness={0.8} />
        </mesh>
      </group>

      <SweatDrops visible={isExhausted || isSweating} />

      {/* Expressive Sumo Eyes on Front (-Z Face) */}
      <group position={[0, 0.95, -0.76]}>
          {/* Left Eye */}
          <mesh position={[-0.35, 0, 0]}>
            <planeGeometry args={[0.22, 0.22]} />
            <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-0.35, 0, -0.01]}>
            <planeGeometry args={[0.1, 0.1]} />
            <meshBasicMaterial
              color={isExhausted ? '#94a3b8' : '#0f172a'}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Right Eye */}
          <mesh position={[0.35, 0, 0]}>
            <planeGeometry args={[0.22, 0.22]} />
            <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.35, 0, -0.01]}>
            <planeGeometry args={[0.1, 0.1]} />
            <meshBasicMaterial
              color={isExhausted ? '#94a3b8' : '#0f172a'}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Eyebrows */}
          <mesh
            position={[-0.35, 0.16, -0.01]}
            rotation={[0, 0, isExhausted ? -0.2 : isPlayer ? 0.2 : -0.25]}>
            <planeGeometry args={[0.26, 0.06]} />
            <meshBasicMaterial color="#0f172a" side={THREE.DoubleSide} />
          </mesh>
          <mesh
            position={[0.35, 0.16, -0.01]}
            rotation={[0, 0, isExhausted ? 0.2 : isPlayer ? -0.2 : 0.25]}>
            <planeGeometry args={[0.26, 0.06]} />
            <meshBasicMaterial color="#0f172a" side={THREE.DoubleSide} />
          </mesh>

          {/* Rosy Sumo Cheeks */}
          <mesh position={[-0.45, -0.2, -0.01]}>
            <planeGeometry args={[0.18, 0.1]} />
            <meshBasicMaterial
              color={isExhausted ? '#38bdf8' : '#f43f5e'}
              transparent
              opacity={0.65}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0.45, -0.2, -0.01]}>
            <planeGeometry args={[0.18, 0.1]} />
            <meshBasicMaterial
              color={isExhausted ? '#38bdf8' : '#f43f5e'}
              transparent
              opacity={0.65}
              side={THREE.DoubleSide}
            />
          </mesh>
      </group>
    </group>
  );
}

function SweatDrops({visible}: {visible: boolean}) {
  const frontDropsRef = useRef<THREE.Group>(null);
  const backDropsRef = useRef<THREE.Group>(null);

  useFrame(({clock}) => {
    const phase = clock.elapsedTime * 7;
    if (frontDropsRef.current) {
      frontDropsRef.current.position.y = 1.45 + Math.sin(phase) * 0.08;
      frontDropsRef.current.children.forEach((drop, index) => {
        drop.rotation.z = Math.sin(phase * 0.7 + index * 2.1) * 0.25;
      });
    }
    if (backDropsRef.current) {
      backDropsRef.current.position.y = 1.8 + Math.sin(phase + 1.2) * 0.08;
      backDropsRef.current.children.forEach((drop, index) => {
        drop.rotation.z = Math.sin(phase * 0.7 + index * 2.1 + 1.2) * 0.25;
      });
    }
  });

  return (
    <group visible={visible}>
      <group ref={frontDropsRef} position={[0, 1.45, 0]}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.7, 0, -0.82]}
            scale={[0.09, 0.15, 0.055]}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        ))}
        <mesh position={[0.82, -0.23, -0.82]} scale={[0.07, 0.12, 0.05]}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color="#7dd3fc" />
        </mesh>
      </group>
      <group ref={backDropsRef} position={[0, 1.8, 0]}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.55, 0, 0.82]}
            scale={[0.09, 0.15, 0.055]}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        ))}
        <mesh position={[0.75, -0.22, 0.82]} scale={[0.07, 0.12, 0.05]}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color="#7dd3fc" />
        </mesh>
      </group>
    </group>
  );
}

// Japanese Dohyo Ring Arena
function ArenaFloor({
  currentWidth,
  currentLength,
  initialWidth,
  initialLength,
}: {
  currentWidth: number;
  currentLength: number;
  initialWidth: number;
  initialLength: number;
}) {
  const isRingPresent = currentWidth > 0.1 && currentLength > 0.1;
  const colW = Math.max(0.01, currentWidth / 2);
  const colL = Math.max(0.01, currentLength / 2);

  return (
    <group>
      {/* Physical Floor Collidable Rect */}
      {isRingPresent && (
        <RigidBody type="fixed" colliders={false} name="arena-floor" friction={0.6} restitution={0.1}>
          <CuboidCollider
            args={[colW, 0.5, colL]}
            position={[0, -0.5, 0]}
          />
          {/* Playable Dohyo Tatami Mat */}
          <mesh position={[0, -0.02, 0]} receiveShadow>
            <boxGeometry args={[Math.max(0.01, currentWidth), 0.4, Math.max(0.01, currentLength)]} />
            <meshStandardMaterial
              color="#d97706"
              roughness={0.7}
              metalness={0.05}
            />
          </mesh>
        </RigidBody>
      )}

      {/* Perimeter Warning Line */}
      {isRingPresent && (
        <mesh position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[Math.max(0.01, currentWidth), Math.max(0.01, currentLength)]} />
          <meshBasicMaterial color="#ef4444" wireframe />
        </mesh>
      )}

      {/* Japanese Torii Columns */}
      <mesh position={[-initialWidth / 2 - 2, 2, -initialLength / 2 - 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.35, 6, 8]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.5} />
      </mesh>
      <mesh position={[initialWidth / 2 + 2, 2, -initialLength / 2 - 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.35, 6, 8]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.5} />
      </mesh>
      <mesh position={[-initialWidth / 2 - 2, 2, initialLength / 2 + 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.35, 6, 8]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.5} />
      </mesh>
      <mesh position={[initialWidth / 2 + 2, 2, initialLength / 2 + 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.35, 6, 8]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.5} />
      </mesh>

      {/* Floating lanterns */}
      <mesh position={[-initialWidth / 2 - 2, 5.55, -initialLength / 2 - 2]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[initialWidth / 2 + 2, 5.55, -initialLength / 2 - 2]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[-initialWidth / 2 - 2, 5.55, initialLength / 2 + 2]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[initialWidth / 2 + 2, 5.55, initialLength / 2 + 2]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

// Particle Sparks on Hit
interface HitSpark {
  id: number;
  pos: [number, number, number];
  scale: number;
}

function HitSparkEffect({sparks}: {sparks: HitSpark[]}) {
  return (
    <group>
      {sparks.map((s) => (
        <mesh key={s.id} position={s.pos}>
          <sphereGeometry args={[s.scale, 8, 8]} />
          <meshBasicMaterial color="#fde047" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// Floating Ambient Particles
function FloatingParticles() {
  const count = 35;
  const particles = useMemo(() => {
    return Array.from({length: count}, () => ({
      pos: [
        (Math.random() - 0.5) * 35,
        Math.random() * 12 + 1,
        (Math.random() - 0.5) * 35,
      ] as [number, number, number],
      speed: Math.random() * 0.5 + 0.2,
      size: Math.random() * 0.15 + 0.08,
    }));
  }, []);

  return (
    <group>
      {particles.map((p, i) => (
        <mesh key={i} position={p.pos}>
          <sphereGeometry args={[p.size, 6, 6]} />
          <meshBasicMaterial color="#f472b6" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function ArenaScene({
  gameState,
  setGameState,
  gameStateRef,
  inputRef,
  gameMode,
  cpuDifficulty,
  isPaused,
  playerStamina,
  setPlayerStamina,
  playerExhausted,
  setPlayerExhausted,
  enemyStamina,
  setEnemyStamina,
  enemyExhausted,
  setEnemyExhausted,
}: GameProps) {
  const {camera} = useThree();
  const {world} = useRapier();

  // Arena Dimensions state
  const initialWidth = getConfig('initialRingWidth');
  const initialLength = getConfig('initialRingLength');
  const minRingSize = getConfig('minRingSize');
  const shrinkSpeed = getConfig('shrinkSpeed');

  const [ringDim, setRingDim] = useState({
    width: initialWidth,
    length: initialLength,
  });

  const ringDimRef = useRef({
    width: initialWidth,
    length: initialLength,
  });

  // Rigid Body Refs
  const playerBodyRef = useRef<RapierRigidBody>(null);
  const enemyBodyRef = useRef<RapierRigidBody>(null);

  // Visual Groups
  // States
  const [playerStunned, setPlayerStunned] = useState(false);
  const [enemyStunned, setEnemyStunned] = useState(false);
  const [playerSweating, setPlayerSweating] = useState(false);
  const [enemySweating, setEnemySweating] = useState(false);
  const [hitSparks, setHitSparks] = useState<HitSpark[]>([]);

  // AI Tactical State Ref ('ATTACK' or 'REST')
  const aiTacticalStateRef = useRef<'ATTACK' | 'REST'>('ATTACK');

  // Cooldowns & Internal AI logic
  const playerJumpCooldownRef = useRef(0);
  const enemyJumpCooldownRef = useRef(0);
  const playerJumpsRemainingRef = useRef(0);
  const enemyJumpsRemainingRef = useRef(0);
  const playerOnEnemySupportRef = useRef(false);
  const enemyOnPlayerSupportRef = useRef(false);
  const playerEnemySupportTimeRef = useRef(0);
  const enemyPlayerSupportTimeRef = useRef(0);
  const bumpCooldownRef = useRef(0);
  const enemySumoPushCooldownRef = useRef(0);

  // Exhaustion Timers (2 seconds duration when stamina hits 0)
  const playerExhaustionTimerRef = useRef(0);
  const enemyExhaustionTimerRef = useRef(0);

  // Bounce animation / stun states (during bounce, opponent is locked in animation)
  const enemyBounceTimerRef = useRef(0);
  const playerBounceTimerRef = useRef(0);
  const playerSweatTimerRef = useRef(0);
  const enemySweatTimerRef = useRef(0);

  const playerHeadingRef = useRef(0);
  const enemyHeadingRef = useRef(0);
  const roundResolvedRef = useRef(false);

  // Key / Pointer tracking
  const prevJumpPressedRef = useRef(false);
  const prevTapPressedRef = useRef(false);
  const prevEnemyJumpPressedRef = useRef(false);
  const prevEnemyTapPressedRef = useRef(false);

  // Local stamina refs for smooth 60fps frame loop
  const pStaminaRef = useRef(100);
  const eStaminaRef = useRef(100);
  const lastStaminaSyncRef = useRef(0);

  // Helper to reset the arena ring back to initial large size
  const resetArenaAndPositions = () => {
    ringDimRef.current = {
      width: initialWidth,
      length: initialLength,
    };
    setRingDim({
      width: initialWidth,
      length: initialLength,
    });

    pStaminaRef.current = 100;
    eStaminaRef.current = 100;
    aiTacticalStateRef.current = 'ATTACK';
    playerExhaustionTimerRef.current = 0;
    enemyExhaustionTimerRef.current = 0;
    playerOnEnemySupportRef.current = false;
    enemyOnPlayerSupportRef.current = false;
    playerJumpsRemainingRef.current = 0;
    enemyJumpsRemainingRef.current = 0;
    playerEnemySupportTimeRef.current = 0;
    enemyPlayerSupportTimeRef.current = 0;
    enemyBounceTimerRef.current = 0;
    playerBounceTimerRef.current = 0;
    enemySumoPushCooldownRef.current = 0;
    playerSweatTimerRef.current = 0;
    enemySweatTimerRef.current = 0;
    playerHeadingRef.current = 0;
    enemyHeadingRef.current = Math.PI;

    setPlayerStamina(100);
    setEnemyStamina(100);
    setPlayerExhausted(false);
    setEnemyExhausted(false);
    setPlayerStunned(false);
    setEnemyStunned(false);
    setPlayerSweating(false);
    setEnemySweating(false);

    if (playerBodyRef.current) {
      playerBodyRef.current.setTranslation({x: 0, y: 1.5, z: 6}, true);
      playerBodyRef.current.setRotation({x: 0, y: 0, z: 0, w: 1}, true);
      playerBodyRef.current.setLinvel({x: 0, y: 0, z: 0}, true);
      playerBodyRef.current.setAngvel({x: 0, y: 0, z: 0}, true);
    }
    if (enemyBodyRef.current) {
      enemyBodyRef.current.setTranslation({x: 0, y: 1.5, z: -6}, true);
      enemyBodyRef.current.setRotation({x: 0, y: 1, z: 0, w: 0}, true);
      enemyBodyRef.current.setLinvel({x: 0, y: 0, z: 0}, true);
      enemyBodyRef.current.setAngvel({x: 0, y: 0, z: 0}, true);
    }
  };

  // Reset arena and fighters on level/round change
  useEffect(() => {
    roundResolvedRef.current = false;
    resetArenaAndPositions();
  }, [gameState.level, initialWidth, initialLength]);

  useFrame((_, delta) => {
    if (isPaused || gameState.status !== 'PLAYING') return;

    const dt = Math.min(delta, 0.1);
    const actions = inputRef.current.actions;
    const enemyActions = inputRef.current.player2Actions;
    const pointer = inputRef.current.pointer;
    const localMultiplayer = gameMode === 'local-multiplayer';

    const showPlayerSweat = () => {
      playerSweatTimerRef.current = 0.8;
      setPlayerSweating(true);
    };
    const showEnemySweat = () => {
      enemySweatTimerRef.current = 0.8;
      setEnemySweating(true);
    };

    // 1. Gradually shrink the rectangular Dohyo ring over time until it completely disappears
    if (ringDimRef.current.width > 0 || ringDimRef.current.length > 0) {
      const speed = shrinkSpeed * (1 + (gameState.level - 1) * 0.08);
      ringDimRef.current.width = Math.max(
        0,
        ringDimRef.current.width - speed * dt,
      );
      ringDimRef.current.length = Math.max(
        0,
        ringDimRef.current.length - speed * (initialLength / initialWidth) * dt,
      );
      setRingDim({
        width: ringDimRef.current.width,
        length: ringDimRef.current.length,
      });
    }

    // Cooldown decrements
    if (playerJumpCooldownRef.current > 0) playerJumpCooldownRef.current -= dt;
    if (enemyJumpCooldownRef.current > 0) enemyJumpCooldownRef.current -= dt;
    if (bumpCooldownRef.current > 0) bumpCooldownRef.current -= dt;
    if (enemySumoPushCooldownRef.current > 0) enemySumoPushCooldownRef.current -= dt;

    // Handle Exhaustion Timers (2.0s duration penalty: stamina locked to 0, no jumping + 20% speed)
    if (playerExhaustionTimerRef.current > 0) {
      playerExhaustionTimerRef.current -= dt;
      pStaminaRef.current = 0; // Lock to 0
      if (playerExhaustionTimerRef.current <= 0) {
        playerExhaustionTimerRef.current = 0;
        pStaminaRef.current = getConfig('maxStamina');
        setPlayerStamina(getConfig('maxStamina'));
        setPlayerExhausted(false);
      }
    }
    if (enemyExhaustionTimerRef.current > 0) {
      enemyExhaustionTimerRef.current -= dt;
      eStaminaRef.current = 0; // Lock to 0
      if (enemyExhaustionTimerRef.current <= 0) {
        enemyExhaustionTimerRef.current = 0;
        eStaminaRef.current = getConfig('maxStamina');
        setEnemyStamina(getConfig('maxStamina'));
        setEnemyExhausted(false);
      }
    }

    // Bounce / animation lock timers
    if (enemyBounceTimerRef.current > 0) {
      enemyBounceTimerRef.current -= dt;
      if (enemyBounceTimerRef.current <= 0) {
        enemyBounceTimerRef.current = 0;
        setEnemyStunned(false);
      }
    }
    if (playerBounceTimerRef.current > 0) {
      playerBounceTimerRef.current -= dt;
      if (playerBounceTimerRef.current <= 0) {
        playerBounceTimerRef.current = 0;
        setPlayerStunned(false);
      }
    }

    // Decay hit sparks
    if (hitSparks.length > 0) {
      setHitSparks((prev) =>
        prev
          .map((s) => ({...s, scale: s.scale * 0.88}))
          .filter((s) => s.scale > 0.15),
      );
    }

    const playerBody = playerBodyRef.current;
    const enemyBody = enemyBodyRef.current;
    if (!playerBody || !enemyBody) return;

    const pPos = playerBody.translation();
    const ePos = enemyBody.translation();
    const pLinvel = playerBody.linvel();
    const eLinvel = enemyBody.linvel();

    // Out-of-bounds Check (Player or Enemy fell off the ring)
    if (!roundResolvedRef.current) {
      if (pPos.y < -3.5) {
        // Player fell off
        roundResolvedRef.current = true;
        gameAudio.playDefeatMotif();
        if (localMultiplayer) {
          const remainingLives = (gameState.playerLives ?? 3) - 1;
          setGameState((prev) => ({
            ...prev,
            playerLives: remainingLives,
            status: remainingLives <= 0 ? 'GAME_OVER' : 'PLAYING',
          }));
          if (remainingLives > 0) {
            setTimeout(() => {
              if (gameStateRef.current.status === 'PLAYING') {
                resetArenaAndPositions();
                roundResolvedRef.current = false;
              }
            }, 1200);
          }
        } else {
          const currentLosses = (gameState.roundLosses || 0) + 1;
          setGameState((prev) => ({
            ...prev,
            status: currentLosses >= 3 ? 'GAME_OVER' : 'PLAYING',
            roundLosses: currentLosses,
          }));
          if (currentLosses < 3) {
            setTimeout(() => {
              if (gameStateRef.current.status === 'PLAYING') {
                resetArenaAndPositions();
                roundResolvedRef.current = false;
              }
            }, 1200);
          }
        }
      } else if (ePos.y < -3.5) {
        // Opponent fell off!
        roundResolvedRef.current = true;
        gameAudio.playVictoryFanfare();
        if (localMultiplayer) {
          const remainingLives = (gameState.opponentLives ?? 3) - 1;
          setGameState((prev) => ({
            ...prev,
            opponentLives: remainingLives,
            status: remainingLives <= 0 ? 'VICTORY' : 'PLAYING',
          }));
          if (remainingLives > 0) {
            setTimeout(() => {
              if (gameStateRef.current.status === 'PLAYING') {
                resetArenaAndPositions();
                roundResolvedRef.current = false;
              }
            }, 1200);
          }
        } else {
          const newWins = (gameState.roundWins || 0) + 1;
          const roundScore = 350 + gameState.level * 150;
          setGameState((prev) => ({
            ...prev,
            score: prev.score + roundScore,
            roundWins: newWins,
            level: prev.level + 1,
          }));
        }
      }
    }

    // Rapier can report nearby pairs without any actual touching contacts.
    const enemyDist = Math.hypot(pPos.x - ePos.x, pPos.z - ePos.z);
    let isTouchingOpponent = false;
    for (let i = 0; i < playerBody.numColliders() && !isTouchingOpponent; i += 1) {
      const playerCollider = playerBody.collider(i);
      world.contactPairsWith(playerCollider, (otherCollider) => {
        if (otherCollider.parent()?.handle !== enemyBody.handle) return;
        world.contactPair(playerCollider, otherCollider, (manifold) => {
          for (let j = 0; j < manifold.numContacts(); j += 1) {
            if (manifold.contactDist(j) <= 0) {
              isTouchingOpponent = true;
              break;
            }
          }
        });
      });
    }

    // Only allow a jump from the floor or after actually landing on the other cube.
    const isPlayerOnFloor = pPos.y <= 1.2 && Math.abs(pLinvel.y) < 1.5;
    const playerAboveEnemy =
      pPos.y > ePos.y + 1.25 &&
      pPos.y < ePos.y + 1.8 &&
      Math.abs(pPos.x - ePos.x) < 1.5 &&
      Math.abs(pPos.z - ePos.z) < 1.5;
    const playerRelativeVerticalSpeed = pLinvel.y - eLinvel.y;
    if (!playerAboveEnemy || playerRelativeVerticalSpeed > 0.5) {
      playerOnEnemySupportRef.current = false;
      playerEnemySupportTimeRef.current = 0;
    } else if (playerRelativeVerticalSpeed < -0.5) {
      playerOnEnemySupportRef.current = true;
    } else if (Math.abs(pLinvel.y) < 1 && Math.abs(eLinvel.y) < 1) {
      playerEnemySupportTimeRef.current += dt;
      if (playerEnemySupportTimeRef.current >= 0.12) {
        playerOnEnemySupportRef.current = true;
      }
    } else {
      playerEnemySupportTimeRef.current = 0;
    }
    const isPlayerOnTopEnemy = playerAboveEnemy && playerOnEnemySupportRef.current;
    const isPlayerSupported = isPlayerOnFloor || isPlayerOnTopEnemy;
    if (isPlayerSupported) playerJumpsRemainingRef.current = 2;
    const canPlayerJump =
      isPlayerSupported || playerJumpsRemainingRef.current > 0;

    const isEnemyOnFloor = ePos.y <= 1.2 && Math.abs(eLinvel.y) < 1.5;
    const enemyAbovePlayer =
      ePos.y > pPos.y + 1.25 &&
      ePos.y < pPos.y + 1.8 &&
      Math.abs(ePos.x - pPos.x) < 1.5 &&
      Math.abs(ePos.z - pPos.z) < 1.5;
    const enemyRelativeVerticalSpeed = eLinvel.y - pLinvel.y;
    if (!enemyAbovePlayer || enemyRelativeVerticalSpeed > 0.5) {
      enemyOnPlayerSupportRef.current = false;
      enemyPlayerSupportTimeRef.current = 0;
    } else if (enemyRelativeVerticalSpeed < -0.5) {
      enemyOnPlayerSupportRef.current = true;
    } else if (Math.abs(eLinvel.y) < 1 && Math.abs(pLinvel.y) < 1) {
      enemyPlayerSupportTimeRef.current += dt;
      if (enemyPlayerSupportTimeRef.current >= 0.12) {
        enemyOnPlayerSupportRef.current = true;
      }
    } else {
      enemyPlayerSupportTimeRef.current = 0;
    }
    const isEnemyOnTopPlayer = enemyAbovePlayer && enemyOnPlayerSupportRef.current;
    const isEnemySupported = isEnemyOnFloor || isEnemyOnTopPlayer;
    if (isEnemySupported) enemyJumpsRemainingRef.current = 2;
    const canEnemyJump =
      isEnemySupported || enemyJumpsRemainingRef.current > 0;

    // 2. Player Locomotion (WASD / D-Pad)
    playerMoveDir.set(0, 0, 0);
    if (actions.left) playerMoveDir.x -= 1;
    if (actions.right) playerMoveDir.x += 1;
    if (actions.up) playerMoveDir.z -= 1;
    if (actions.down) playerMoveDir.z += 1;

    const isMoving = playerMoveDir.lengthSq() > 0;
    const isPlayerExhausted = playerExhaustionTimerRef.current > 0;
    const isEnemyExhausted = enemyExhaustionTimerRef.current > 0;
    const baseSpeed = getConfig('playerSpeed');
    const exhaustionSpeedMult = getConfig('exhaustionSpeedMultiplier'); // 20% speed
    const playerSpeed = isPlayerExhausted ? baseSpeed * exhaustionSpeedMult : baseSpeed;

    const maxStamina = getConfig('maxStamina');
    const moveDrain = getConfig('staminaMoveDrainPerSec');
    const regenRate = getConfig('staminaRegenPerSec');
    const jumpCost = getConfig('staminaJumpCost');
    const sumoPushCost = getConfig('staminaSumoPushCost');
    const exhaustionDuration = getConfig('exhaustionDuration'); // 2.0s

    // Player Stamina Handling
    if (!isPlayerExhausted) {
      if (isMoving) {
        pStaminaRef.current = Math.max(0, pStaminaRef.current - moveDrain * dt);
        if (pStaminaRef.current <= 0) {
          pStaminaRef.current = 0;
          playerExhaustionTimerRef.current = exhaustionDuration;
          setPlayerExhausted(true);
          gameAudio.playErrorBuzz();
        }
      } else {
        pStaminaRef.current = Math.min(maxStamina, pStaminaRef.current + regenRate * dt);
      }
    } else {
      // While exhausted, keep stamina locked at strictly 0 for the entire exhaustion duration (2.0s)
      pStaminaRef.current = 0;
    }

    // Apply player velocity if not stunned by bounce animation
    if (playerBounceTimerRef.current <= 0) {
      const currentPLinvel = playerBody.linvel();
      if (isMoving) {
        playerMoveDir.normalize();
        playerBody.setLinvel(
          {
            x: playerMoveDir.x * playerSpeed,
            y: currentPLinvel.y,
            z: playerMoveDir.z * playerSpeed,
          },
          true,
        );
        playerHeadingRef.current = Math.atan2(playerMoveDir.x, playerMoveDir.z) + Math.PI;
      } else {
        playerBody.setLinvel(
          {
            x: currentPLinvel.x * 0.88,
            y: currentPLinvel.y,
            z: currentPLinvel.z * 0.88,
          },
          true,
        );
      }
    }

    // 3. JUMP MECHANIC: PLAYER
    // Can jump if touching ground, on top of enemy, or engaged in contact AND not exhausted
    const jumpPressed = actions.jump;
    const jumpAttempted =
      jumpPressed &&
      !prevJumpPressedRef.current &&
      playerJumpCooldownRef.current <= 0 &&
      canPlayerJump &&
      !isPlayerExhausted;
    const jumpVelocity = getConfig('jumpVelocity');

    if (jumpAttempted && pStaminaRef.current < jumpCost) {
      showPlayerSweat();
    } else if (jumpAttempted) {
      playerJumpCooldownRef.current = 0.25;
      playerJumpsRemainingRef.current -= 1;
      pStaminaRef.current = Math.max(0, pStaminaRef.current - jumpCost);
      if (pStaminaRef.current <= 0) {
        pStaminaRef.current = 0;
        playerExhaustionTimerRef.current = exhaustionDuration;
        setPlayerExhausted(true);
        gameAudio.playErrorBuzz();
      }
      gameAudio.playRetroJump();

      playerOnEnemySupportRef.current = false;
      playerEnemySupportTimeRef.current = 0;
      const currentPLinvel = playerBody.linvel();
      playerBody.setLinvel(
        {
          x: currentPLinvel.x,
          y: jumpVelocity,
          z: currentPLinvel.z,
        },
        true,
      );
    }
    prevJumpPressedRef.current = jumpPressed;

    // 4. SUMO PUSH ON CLICK (Tapping/Clicking when touching enemy)
    // Dynamic push strength proportional to stamina differential
    const tapPressed = pointer.down || actions.confirm;
    if (
      tapPressed &&
      !prevTapPressedRef.current &&
      !isPlayerExhausted
    ) {
      // Only takes effect if touching the opponent
      if (isTouchingOpponent) {
        if (pStaminaRef.current < sumoPushCost) {
          showPlayerSweat();
        } else {
          // Push in the movement direction, or toward the enemy if stationary.
          let pushDirX = playerMoveDir.x;
          let pushDirZ = playerMoveDir.z;

          if (pushDirX === 0 && pushDirZ === 0) {
            pushDirX = (ePos.x - pPos.x) / (enemyDist || 1);
            pushDirZ = (ePos.z - pPos.z) / (enemyDist || 1);
          }

          const staminaDiff = pStaminaRef.current - eStaminaRef.current;
          pStaminaRef.current = Math.max(0, pStaminaRef.current - sumoPushCost);
          if (pStaminaRef.current <= 0) {
            pStaminaRef.current = 0;
            playerExhaustionTimerRef.current = exhaustionDuration;
            setPlayerExhausted(true);
            gameAudio.playErrorBuzz();
          }

          const pushImpulse = 16 + Math.max(0, staminaDiff / 100) * 10;

          enemyBounceTimerRef.current = 0.5;
          setEnemyStunned(true);
          enemyBody.setLinvel(
            {
              x: pushDirX * pushImpulse,
              y: 3.2,
              z: pushDirZ * pushImpulse,
            },
            true,
          );

          gameAudio.playGunshotBlast();
          setHitSparks([
            {
              id: Date.now(),
              pos: [(pPos.x + ePos.x) / 2, (pPos.y + ePos.y) / 2 + 0.5, (pPos.z + ePos.z) / 2],
              scale: 1.2,
            },
          ]);
        }
      }
    }
    prevTapPressedRef.current = tapPressed;

    // 6. LOCAL OPPONENT CONTROLS OR ENEMY AI
    // The AI focuses solely on chasing and shoving the player out of the ring!
    // When exhausted, it moves slowly and recovers stamina.
    const aiSpeedRatio = AI_DIFFICULTY_SPEED_RATIOS[cpuDifficulty];
    const baseEnemySpeed = localMultiplayer
      ? baseSpeed
      : baseSpeed * aiSpeedRatio;
    const enemySpeed = isEnemyExhausted ? baseEnemySpeed * exhaustionSpeedMult : baseEnemySpeed;

    enemyMoveDir.set(0, 0, 0);
    let enemyIsMoving = false;

    if (localMultiplayer) {
      if (enemyActions.left) enemyMoveDir.x -= 1;
      if (enemyActions.right) enemyMoveDir.x += 1;
      if (enemyActions.up) enemyMoveDir.z -= 1;
      if (enemyActions.down) enemyMoveDir.z += 1;
      enemyIsMoving = enemyMoveDir.lengthSq() > 0;

      if (enemyBounceTimerRef.current <= 0) {
        const curEnemyLinvel = enemyBody.linvel();
        if (enemyIsMoving) {
          enemyMoveDir.normalize();
          enemyHeadingRef.current = Math.atan2(enemyMoveDir.x, enemyMoveDir.z) + Math.PI;
          enemyBody.setLinvel(
            {
              x: enemyMoveDir.x * enemySpeed,
              y: curEnemyLinvel.y,
              z: enemyMoveDir.z * enemySpeed,
            },
            true,
          );
        } else {
          enemyBody.setLinvel(
            {
              x: curEnemyLinvel.x * 0.88,
              y: curEnemyLinvel.y,
              z: curEnemyLinvel.z * 0.88,
            },
            true,
          );
        }

        const enemyJumpPressed = enemyActions.jump;
        const enemyJumpAttempted =
          enemyJumpPressed &&
          !prevEnemyJumpPressedRef.current &&
          enemyJumpCooldownRef.current <= 0 &&
          canEnemyJump &&
          !isEnemyExhausted;
        if (enemyJumpAttempted && eStaminaRef.current < jumpCost) {
          showEnemySweat();
        } else if (enemyJumpAttempted) {
          enemyJumpCooldownRef.current = 0.25;
          enemyJumpsRemainingRef.current -= 1;
          eStaminaRef.current = Math.max(0, eStaminaRef.current - jumpCost);
          if (eStaminaRef.current <= 0) {
            eStaminaRef.current = 0;
            enemyExhaustionTimerRef.current = exhaustionDuration;
            setEnemyExhausted(true);
          }
          gameAudio.playRetroJump();
          enemyOnPlayerSupportRef.current = false;
          enemyPlayerSupportTimeRef.current = 0;
          const latestEnemyLinvel = enemyBody.linvel();
          enemyBody.setLinvel(
            {x: latestEnemyLinvel.x, y: jumpVelocity, z: latestEnemyLinvel.z},
            true,
          );
        }
        prevEnemyJumpPressedRef.current = enemyJumpPressed;

        const enemyPushPressed = enemyActions.confirm;
        if (
          enemyPushPressed &&
          !prevEnemyTapPressedRef.current &&
          !isEnemyExhausted
        ) {
          if (isTouchingOpponent) {
            if (eStaminaRef.current < sumoPushCost) {
              showEnemySweat();
            } else {
              let pushDirX = enemyMoveDir.x;
              let pushDirZ = enemyMoveDir.z;
              if (pushDirX === 0 && pushDirZ === 0) {
                pushDirX = (pPos.x - ePos.x) / (enemyDist || 1);
                pushDirZ = (pPos.z - ePos.z) / (enemyDist || 1);
              }

              const staminaDiff = eStaminaRef.current - pStaminaRef.current;
              eStaminaRef.current = Math.max(0, eStaminaRef.current - sumoPushCost);
              if (eStaminaRef.current <= 0) {
                eStaminaRef.current = 0;
                enemyExhaustionTimerRef.current = exhaustionDuration;
                setEnemyExhausted(true);
              }

              const pushImpulse = 16 + Math.max(0, staminaDiff / 100) * 10;
              playerBounceTimerRef.current = 0.5;
              setPlayerStunned(true);
              playerBody.setLinvel(
                {x: pushDirX * pushImpulse, y: 3.2, z: pushDirZ * pushImpulse},
                true,
              );
              gameAudio.playGunshotBlast();
              setHitSparks([
                {
                  id: Date.now(),
                  pos: [(pPos.x + ePos.x) / 2, (pPos.y + ePos.y) / 2 + 0.5, (pPos.z + ePos.z) / 2],
                  scale: 1.2,
                },
              ]);
            }
          }
        }
        prevEnemyTapPressedRef.current = enemyPushPressed;
      }
    } else if (enemyBounceTimerRef.current <= 0) {
      // Direct vector towards player for the single-player AI.
      const curEnemyLinvel = enemyBody.linvel();
      if (isEnemyExhausted) {
        enemyMoveDir.set(pPos.x - ePos.x, 0, pPos.z - ePos.z).normalize();
        enemyIsMoving = false;
        scratchVec.set(pPos.x - ePos.x, 0, pPos.z - ePos.z);
        if (scratchVec.lengthSq() > 0.01) {
          enemyHeadingRef.current = Math.atan2(scratchVec.x, scratchVec.z) + Math.PI;
        }
        enemyBody.setLinvel(
          {
            x: enemyMoveDir.x * enemySpeed,
            y: curEnemyLinvel.y,
            z: enemyMoveDir.z * enemySpeed,
          },
          true,
        );
      } else {
        enemyMoveDir.set(pPos.x - ePos.x, 0, pPos.z - ePos.z).normalize();
        enemyIsMoving = true;

        enemyHeadingRef.current = Math.atan2(enemyMoveDir.x, enemyMoveDir.z) + Math.PI;
        enemyBody.setLinvel(
          {
            x: enemyMoveDir.x * enemySpeed,
            y: curEnemyLinvel.y,
            z: enemyMoveDir.z * enemySpeed,
          },
          true,
        );

        if (
          canEnemyJump &&
          eStaminaRef.current > 40 &&
          enemyJumpCooldownRef.current <= 0
        ) {
          const shouldJump = (pPos.y > ePos.y + 0.6 && enemyDist < 3.2) || (enemyDist < 2.0 && Math.random() < 0.012);
          if (shouldJump) {
            enemyJumpCooldownRef.current = 2.4;
            enemyJumpsRemainingRef.current -= 1;
            eStaminaRef.current = Math.max(0, eStaminaRef.current - jumpCost);
            if (eStaminaRef.current <= 0) {
              eStaminaRef.current = 0;
              enemyExhaustionTimerRef.current = exhaustionDuration;
              setEnemyExhausted(true);
            }
            enemyOnPlayerSupportRef.current = false;
            enemyPlayerSupportTimeRef.current = 0;
            const latestEnemyLinvel = enemyBody.linvel();
            enemyBody.setLinvel(
              {
                x: latestEnemyLinvel.x,
                y: jumpVelocity * 0.9,
                z: latestEnemyLinvel.z,
              },
              true,
            );
          }
        }

        if (
          isTouchingOpponent &&
          !isEnemyExhausted &&
          enemyBounceTimerRef.current <= 0 &&
          eStaminaRef.current >= sumoPushCost &&
          enemySumoPushCooldownRef.current <= 0
        ) {
          const pushChance = 0.035 + Math.min(0.04, gameState.level * 0.005);
          if (Math.random() < pushChance) {
            enemySumoPushCooldownRef.current = Math.max(1.8, 3.2 - gameState.level * 0.15);

            eStaminaRef.current = Math.max(0, eStaminaRef.current - sumoPushCost);
            if (eStaminaRef.current <= 0) {
              eStaminaRef.current = 0;
              enemyExhaustionTimerRef.current = exhaustionDuration;
              setEnemyExhausted(true);
            }

            const pushDirX = (pPos.x - ePos.x) / (enemyDist || 1);
            const pushDirZ = (pPos.z - ePos.z) / (enemyDist || 1);

            const staminaDiff = eStaminaRef.current - pStaminaRef.current;
            const pushImpulse = Math.max(5.0, 14.0 + (staminaDiff / 100) * 12.0);

            const bounceDuration = 0.35;
            playerBounceTimerRef.current = bounceDuration;
            setPlayerStunned(true);

            playerBody.setLinvel(
              {
                x: pushDirX * pushImpulse,
                y: 3.2,
                z: pushDirZ * pushImpulse,
              },
              true,
            );

            gameAudio.playGunshotBlast();
            setHitSparks([
              {
                id: Date.now(),
                pos: [(pPos.x + ePos.x) / 2, (pPos.y + ePos.y) / 2 + 0.5, (pPos.z + ePos.z) / 2],
                scale: 1.2,
              },
            ]);
          }
        }
      }
    }

    // 7. CONTINUOUS CONTACT (side-by-side wrestling)
    // - Only one cube pushing toward the other: it moves the opponent, regardless of stamina.
    // - Both pushing head-on: the one with more stamina gains ground slowly.
    // Skipped when one cube is above the other so jumps can land on top.
    const isSideContact = isTouchingOpponent && Math.abs(pPos.y - ePos.y) < 0.9;
    if (isSideContact && enemyBounceTimerRef.current <= 0 && playerBounceTimerRef.current <= 0) {
      const dirX = (ePos.x - pPos.x) / (enemyDist || 1);
      const dirZ = (ePos.z - pPos.z) / (enemyDist || 1);

      const playerIntent = isMoving
        ? Math.max(0, playerMoveDir.x * dirX + playerMoveDir.z * dirZ)
        : 0;
      const enemyIntent = enemyIsMoving
        ? Math.max(0, -(enemyMoveDir.x * dirX + enemyMoveDir.z * dirZ))
        : 0;
      const playerPushing = playerIntent > 0.3;
      const enemyPushing = enemyIntent > 0.3;

      // Positive = pair moves toward the enemy side (player winning).
      let contactSpeed = 0;
      if (playerPushing && !enemyPushing) {
        contactSpeed = playerSpeed * 0.75 * playerIntent;
      } else if (enemyPushing && !playerPushing) {
        contactSpeed = -enemySpeed * 0.75 * enemyIntent;
      } else if (playerPushing && enemyPushing) {
        if (isEnemyExhausted && !isPlayerExhausted) {
          contactSpeed = playerSpeed * 0.5;
        } else if (isPlayerExhausted && !isEnemyExhausted) {
          contactSpeed = -enemySpeed * 0.5;
        } else {
          const staminaDiff = pStaminaRef.current - eStaminaRef.current;
          contactSpeed =
            Math.abs(staminaDiff) < 3
              ? 0
              : Math.sign(staminaDiff) * Math.min(3, 1 + (Math.abs(staminaDiff) / 100) * 4);
        }
      }

      if (playerPushing || enemyPushing) {
        const curPlayerLinvel = playerBody.linvel();
        const curEnemyLinvel = enemyBody.linvel();
        playerBody.setLinvel(
          {x: dirX * contactSpeed, y: curPlayerLinvel.y, z: dirZ * contactSpeed},
          true,
        );
        enemyBody.setLinvel(
          {x: dirX * contactSpeed, y: curEnemyLinvel.y, z: dirZ * contactSpeed},
          true,
        );

        if (bumpCooldownRef.current <= 0) {
          bumpCooldownRef.current = 0.25;
          gameAudio.playMeleePunch();
          setHitSparks([
            {
              id: Date.now(),
              pos: [(pPos.x + ePos.x) / 2, (pPos.y + ePos.y) / 2 + 0.5, (pPos.z + ePos.z) / 2],
              scale: 0.75,
            },
          ]);
        }
      }
    }

    // Enemy stamina handling (Locks to 0 during exhaustion or drains/regenerates when active)
    if (!isEnemyExhausted) {
      if (enemyIsMoving) {
        eStaminaRef.current = Math.max(0, eStaminaRef.current - moveDrain * dt);
        if (eStaminaRef.current <= 0) {
          eStaminaRef.current = 0;
          enemyExhaustionTimerRef.current = exhaustionDuration;
          setEnemyExhausted(true);
        }
      } else {
        eStaminaRef.current = Math.min(maxStamina, eStaminaRef.current + regenRate * dt);
      }
    } else {
      // While exhausted, keep stamina locked at strictly 0 for the entire exhaustion duration (2.0s)
      eStaminaRef.current = 0;
    }

    // Sync stamina states to React HUD periodically
    lastStaminaSyncRef.current += dt;
    if (lastStaminaSyncRef.current > 0.08) {
      lastStaminaSyncRef.current = 0;
      setPlayerStamina(Math.round(pStaminaRef.current));
      setEnemyStamina(Math.round(eStaminaRef.current));
    }

    // Dynamic Camera tracking the midpoint of combat
    const midX = (pPos.x + ePos.x) * 0.35;
    const midZ = (pPos.z + ePos.z) * 0.35;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, midX + getConfig('cameraX'), 0.05);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, getConfig('cameraY'), 0.05);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, midZ + getConfig('cameraZ'), 0.05);
    camera.lookAt(midX, 0.5, midZ);
  });

  return (
    <group>
      <ArenaFloor
        currentWidth={ringDim.width}
        currentLength={ringDim.length}
        initialWidth={initialWidth}
        initialLength={initialLength}
      />
      <FloatingParticles />
      <HitSparkEffect sparks={hitSparks} />

      {/* Player Sumo Cube */}
      <RigidBody
        ref={playerBodyRef}
        position={[0, 1.5, 6]}
        colliders="cuboid"
        mass={2.2}
        friction={0.4}
        restitution={0.2}
        enabledRotations={[false, true, false]}
        name="player-sumo">
        <SumoCubeVisual
          color="#0284c7"
          beltColor="#eab308"
          isPlayer={true}
          isExhausted={playerExhausted}
          isStunned={playerStunned}
          isSweating={playerSweating}
        />
      </RigidBody>

      {/* AI Enemy Sumo Cube */}
      <RigidBody
        ref={enemyBodyRef}
        position={[0, 1.5, -6]}
        rotation={[0, Math.PI, 0]}
        colliders="cuboid"
        mass={2.0}
        friction={0.4}
        restitution={0.3}
        enabledRotations={[false, true, false]}
        name="enemy-sumo">
        <SumoCubeVisual
          color="#e11d48"
          beltColor="#1e293b"
          isPlayer={false}
          isExhausted={enemyExhausted}
          isStunned={enemyStunned}
          isSweating={enemySweating}
        />
      </RigidBody>
    </group>
  );
}

export function Game({
  gameState,
  setGameState,
  exitChat,
  gameStateRef,
  inputRef,
  gameMode,
  cpuDifficulty,
  isPaused,
  playerStamina,
  setPlayerStamina,
  playerExhausted,
  setPlayerExhausted,
  enemyStamina,
  setEnemyStamina,
  enemyExhausted,
  setEnemyExhausted,
}: GameProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="w-full h-full canvas-wrapper relative">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          fov: getConfig('fov'),
          near: 0.1,
          far: 200,
          position: [
            getConfig('cameraX'),
            getConfig('cameraY'),
            getConfig('cameraZ'),
          ],
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        scene={{
          background: new THREE.Color(getConfig('backgroundColor')),
        }}>
        <Suspense fallback={null}>
          {/* Lighting Rig */}
          <ambientLight
            color={getConfig('ambientColor')}
            intensity={getConfig('ambientIntensity')}
          />
          <directionalLight
            position={[12, 22, 14]}
            intensity={getConfig('sunIntensity')}
            color={getConfig('sunColor')}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={60}
            shadow-camera-left={-22}
            shadow-camera-right={22}
            shadow-camera-top={22}
            shadow-camera-bottom={-22}
            shadow-bias={-0.0005}
          />
          <hemisphereLight
            color={getConfig('hemiSkyColor')}
            groundColor={getConfig('hemiGroundColor')}
            intensity={getConfig('hemiIntensity')}
          />

          <Physics
            gravity={[0, getConfig('gravity'), 0]}
            timeStep="vary"
            paused={isPaused}>
            <ArenaScene
              gameState={gameState}
              setGameState={setGameState}
              exitChat={exitChat}
              gameStateRef={gameStateRef}
              inputRef={inputRef}
              gameMode={gameMode}
              cpuDifficulty={cpuDifficulty}
              isPaused={isPaused}
              playerStamina={playerStamina}
              setPlayerStamina={setPlayerStamina}
              playerExhausted={playerExhausted}
              setPlayerExhausted={setPlayerExhausted}
              enemyStamina={enemyStamina}
              setEnemyStamina={setEnemyStamina}
              enemyExhausted={enemyExhausted}
              setEnemyExhausted={setEnemyExhausted}
            />
          </Physics>

          <EffectComposer>
            <Bloom
              luminanceThreshold={0.95}
              luminanceSmoothing={0.8}
              intensity={0.4}
              mipmapBlur
            />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
