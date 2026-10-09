import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {Bloom, EffectComposer} from '@react-three/postprocessing';
import {CuboidCollider, Physics, RapierRigidBody, RigidBody} from '@react-three/rapier';
import React, {Suspense, useEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {getConfig} from './constants';
import {InputSnapshot} from './input';
import {GameState, gameAudio} from './utils/helper';

interface GameProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  exitChat: (payload: Record<string, unknown>) => Promise<void>;
  gameStateRef: React.MutableRefObject<GameState>;
  inputRef: React.MutableRefObject<InputSnapshot>;
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
}

function SumoCubeVisual({
  color,
  beltColor,
  isPlayer = false,
  isExhausted = false,
  isStunned = false,
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

      {/* Expressive Sumo Eyes on Front (-Z Face) */}
      <group position={[0, 0.95, -0.76]}>
        {/* Left Eye */}
        <mesh position={[-0.35, 0, 0]}>
          <planeGeometry args={[0.22, 0.22]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-0.35, 0, -0.01]}>
          <planeGeometry args={[0.1, 0.1]} />
          <meshBasicMaterial color={isExhausted ? '#94a3b8' : '#0f172a'} side={THREE.DoubleSide} />
        </mesh>

        {/* Right Eye */}
        <mesh position={[0.35, 0, 0]}>
          <planeGeometry args={[0.22, 0.22]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0.35, 0, -0.01]}>
          <planeGeometry args={[0.1, 0.1]} />
          <meshBasicMaterial color={isExhausted ? '#94a3b8' : '#0f172a'} side={THREE.DoubleSide} />
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
      <mesh position={[-initialWidth / 2 - 2, 4.5, -initialLength / 2 - 2]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[initialWidth / 2 + 2, 4.5, -initialLength / 2 - 2]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[-initialWidth / 2 - 2, 4.5, initialLength / 2 + 2]}>
        <boxGeometry args={[0.8, 1, 0.8]} />
        <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[initialWidth / 2 + 2, 4.5, initialLength / 2 + 2]}>
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
  const playerVisualRef = useRef<THREE.Group>(null);
  const enemyVisualRef = useRef<THREE.Group>(null);

  // States
  const [playerStunned, setPlayerStunned] = useState(false);
  const [enemyStunned, setEnemyStunned] = useState(false);
  const [hitSparks, setHitSparks] = useState<HitSpark[]>([]);

  // AI Tactical State Ref ('ATTACK' or 'REST')
  const aiTacticalStateRef = useRef<'ATTACK' | 'REST'>('ATTACK');

  // Cooldowns & Internal AI logic
  const playerJumpCooldownRef = useRef(0);
  const enemyJumpCooldownRef = useRef(0);
  const bumpCooldownRef = useRef(0);
  const sumoPushCooldownRef = useRef(0);
  const enemySumoPushCooldownRef = useRef(0);

  // Exhaustion Timers (2 seconds duration when stamina hits 0)
  const playerExhaustionTimerRef = useRef(0);
  const enemyExhaustionTimerRef = useRef(0);

  // Bounce animation / stun states (during bounce, opponent is locked in animation)
  const enemyBounceTimerRef = useRef(0);
  const playerBounceTimerRef = useRef(0);

  const playerHeadingRef = useRef(0);
  const enemyHeadingRef = useRef(0);
  const roundResolvedRef = useRef(false);

  // Key / Pointer tracking
  const prevJumpPressedRef = useRef(false);
  const prevTapPressedRef = useRef(false);

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
    enemyBounceTimerRef.current = 0;
    playerBounceTimerRef.current = 0;
    sumoPushCooldownRef.current = 0;
    enemySumoPushCooldownRef.current = 0;

    setPlayerStamina(100);
    setEnemyStamina(100);
    setPlayerExhausted(false);
    setEnemyExhausted(false);
    setPlayerStunned(false);
    setEnemyStunned(false);

    if (playerBodyRef.current) {
      playerBodyRef.current.setTranslation({x: 0, y: 1.5, z: 6}, true);
      playerBodyRef.current.setLinvel({x: 0, y: 0, z: 0}, true);
      playerBodyRef.current.setAngvel({x: 0, y: 0, z: 0}, true);
    }
    if (enemyBodyRef.current) {
      enemyBodyRef.current.setTranslation({x: 0, y: 1.5, z: -6}, true);
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
    const pointer = inputRef.current.pointer;

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
    if (sumoPushCooldownRef.current > 0) sumoPushCooldownRef.current -= dt;
    if (enemySumoPushCooldownRef.current > 0) enemySumoPushCooldownRef.current -= dt;

    // Handle Exhaustion Timers (2.0s duration penalty: stamina locked to 0, no jumping + 20% speed)
    if (playerExhaustionTimerRef.current > 0) {
      playerExhaustionTimerRef.current -= dt;
      pStaminaRef.current = 0; // Lock to 0
      if (playerExhaustionTimerRef.current <= 0) {
        playerExhaustionTimerRef.current = 0;
        pStaminaRef.current = 30; // Initial bump after exhaustion ends
        setPlayerExhausted(false);
      }
    }
    if (enemyExhaustionTimerRef.current > 0) {
      enemyExhaustionTimerRef.current -= dt;
      eStaminaRef.current = 0; // Lock to 0
      if (enemyExhaustionTimerRef.current <= 0) {
        enemyExhaustionTimerRef.current = 0;
        eStaminaRef.current = 30; // Initial bump after exhaustion ends
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
      } else if (ePos.y < -3.5) {
        // Opponent fell off!
        roundResolvedRef.current = true;
        gameAudio.playVictoryFanfare();
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

    // Contact Distance between cubes
    const enemyDist = Math.hypot(pPos.x - ePos.x, pPos.z - ePos.z);
    const isTouchingOpponent = enemyDist < 1.85;

    // Ground / Support contact checks (Can jump if touching ground, low height, or in contact with opponent)
    const isPlayerOnFloor = pPos.y <= 2.0 && Math.abs(pLinvel.y) < 1.5;
    const isPlayerOnTopEnemy =
      pPos.y > ePos.y + 0.6 &&
      Math.abs(pPos.x - ePos.x) < 1.6 &&
      Math.abs(pPos.z - ePos.z) < 1.6;
    const canPlayerJump = isPlayerOnFloor || isPlayerOnTopEnemy || isTouchingOpponent;

    const isEnemyOnFloor = ePos.y <= 2.0 && Math.abs(eLinvel.y) < 1.5;
    const isEnemyOnTopPlayer =
      ePos.y > pPos.y + 0.6 &&
      Math.abs(ePos.x - pPos.x) < 1.6 &&
      Math.abs(ePos.z - pPos.z) < 1.6;
    const canEnemyJump = isEnemyOnFloor || isEnemyOnTopPlayer || isTouchingOpponent;

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
    const jumpVelocity = getConfig('jumpVelocity');

    if (
      jumpPressed &&
      !prevJumpPressedRef.current &&
      playerJumpCooldownRef.current <= 0 &&
      canPlayerJump &&
      !isPlayerExhausted
    ) {
      playerJumpCooldownRef.current = 0.25;
      pStaminaRef.current = Math.max(0, pStaminaRef.current - jumpCost);
      if (pStaminaRef.current <= 0) {
        pStaminaRef.current = 0;
        playerExhaustionTimerRef.current = exhaustionDuration;
        setPlayerExhausted(true);
        gameAudio.playErrorBuzz();
      }
      gameAudio.playRetroJump();

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
      sumoPushCooldownRef.current <= 0 &&
      !isPlayerExhausted
    ) {
      sumoPushCooldownRef.current = 0.5;

      // Only takes effect if touching the opponent
      if (isTouchingOpponent) {
        // Push occurs in the direction player is moving/pushing (WASD), or towards enemy if stationary
        let pushDirX = playerMoveDir.x;
        let pushDirZ = playerMoveDir.z;

        if (pushDirX === 0 && pushDirZ === 0) {
          pushDirX = (ePos.x - pPos.x) / (enemyDist || 1);
          pushDirZ = (ePos.z - pPos.z) / (enemyDist || 1);
        }

        pStaminaRef.current = Math.max(0, pStaminaRef.current - sumoPushCost);
        if (pStaminaRef.current <= 0) {
          pStaminaRef.current = 0;
          playerExhaustionTimerRef.current = exhaustionDuration;
          setPlayerExhausted(true);
          gameAudio.playErrorBuzz();
        }

        const staminaDiff = pStaminaRef.current - eStaminaRef.current; // [-100, 100]
        // Higher player stamina = massive blast push, lower = weak shove
        const pushImpulse = Math.max(5.0, 14.0 + (staminaDiff / 100) * 12.0);
        
        const bounceDuration = 0.35;
        enemyBounceTimerRef.current = bounceDuration;
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
    prevTapPressedRef.current = tapPressed;

    // 5. CONTINUOUS CONTACT & STAMINA-BASED PUSHING DYNAMICS
    // When cubes make physical contact, their pushing power and displacement velocity
    // are governed directly by stamina difference:
    // - Player stamina > Enemy stamina => Enemy gets pushed back in the player's direction
    // - Enemy stamina > Player stamina => Player gets pushed back in the enemy's direction
    // - The speed of displacement is strictly proportional to the stamina difference.
    if (isTouchingOpponent && enemyBounceTimerRef.current <= 0 && playerBounceTimerRef.current <= 0) {
      const dirX = (ePos.x - pPos.x) / (enemyDist || 1);
      const dirZ = (ePos.z - pPos.z) / (enemyDist || 1);

      // Stamina differential: positive means player is stronger, negative means enemy is stronger
      const staminaDiff = pStaminaRef.current - eStaminaRef.current; // Range approx -100 to +100
      const absDiff = Math.abs(staminaDiff);

      // Scaled displacement velocity based on stamina difference and exhaustion
      // If the defender is exhausted, push speed reaches 26 m/s, otherwise up to 18 m/s
      const normalMaxPush = getConfig('normalMaxPushSpeed'); // 18
      const exhaustedPush = getConfig('exhaustedPushSpeed'); // 26

      const curEnemyLinvel = enemyBody.linvel();
      const curPlayerLinvel = playerBody.linvel();

      if (staminaDiff > 3) {
        // Player overpowers Enemy: forcefully push enemy away in contact vector preserving vertical linvel
        const pushSpeed = isEnemyExhausted
          ? exhaustedPush
          : Math.min(normalMaxPush, 4.0 + (absDiff / 100) * 14.0);

        enemyBody.setLinvel(
          {
            x: dirX * pushSpeed,
            y: curEnemyLinvel.y,
            z: dirZ * pushSpeed,
          },
          true,
        );
        // Player maintains forward momentum into enemy preserving vertical linvel (for jumping!)
        if (isMoving) {
          playerBody.setLinvel(
            {
              x: playerMoveDir.x * (playerSpeed * 0.8),
              y: curPlayerLinvel.y,
              z: playerMoveDir.z * (playerSpeed * 0.8),
            },
            true,
          );
        }
      } else if (staminaDiff < -3) {
        // Enemy overpowers Player: push player backwards away from enemy preserving vertical linvel
        const pushSpeed = isPlayerExhausted
          ? exhaustedPush
          : Math.min(normalMaxPush, 4.0 + (absDiff / 100) * 14.0);

        playerBody.setLinvel(
          {
            x: -dirX * pushSpeed,
            y: curPlayerLinvel.y,
            z: -dirZ * pushSpeed,
          },
          true,
        );
      }

      // Intermittent impact sound & sparks when engaged in close wrestling contact
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

    // 6. ENEMY AI - RELENTLESS OFFENSIVE PURSUIT & STAMINA-DRIVEN PRESSURE
    // The AI focuses solely on chasing and shoving the player out of the ring!
    // When exhausted, it moves slowly and recovers stamina.
    const aiSpeedRatio = getConfig('aiSpeedRatio');
    const baseEnemySpeed = baseSpeed * aiSpeedRatio;
    const enemySpeed = isEnemyExhausted ? baseEnemySpeed * exhaustionSpeedMult : baseEnemySpeed;

    // Direct vector towards player
    enemyMoveDir.set(0, 0, 0);
    let aiIsMoving = false;

    if (enemyBounceTimerRef.current <= 0) {
      const curEnemyLinvel = enemyBody.linvel();
      if (isEnemyExhausted) {
        // When exhausted, AI moves very sluggishly to catch breath
        enemyMoveDir.set(pPos.x - ePos.x, 0, pPos.z - ePos.z).normalize();
        aiIsMoving = false; // Does not drain stamina while exhausted so it can recharge!
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
        // Direct, relentless pursuit towards the player everywhere, pushing all the way off the platform!
        enemyMoveDir.set(pPos.x - ePos.x, 0, pPos.z - ePos.z).normalize();
        aiIsMoving = true;

        enemyHeadingRef.current = Math.atan2(enemyMoveDir.x, enemyMoveDir.z) + Math.PI;
        enemyBody.setLinvel(
          {
            x: enemyMoveDir.x * enemySpeed,
            y: curEnemyLinvel.y,
            z: enemyMoveDir.z * enemySpeed,
          },
          true,
        );

        // 7. Enemy AI Jumping (Only when healthy stamina > 40% and cooldown is ready)
        if (
          canEnemyJump &&
          eStaminaRef.current > 40 &&
          enemyJumpCooldownRef.current <= 0
        ) {
          const shouldJump = (pPos.y > ePos.y + 0.6 && enemyDist < 3.2) || (enemyDist < 2.0 && Math.random() < 0.012);
          if (shouldJump) {
            enemyJumpCooldownRef.current = 2.4;
            eStaminaRef.current = Math.max(0, eStaminaRef.current - jumpCost);
            if (eStaminaRef.current <= 0) {
              eStaminaRef.current = 0;
              enemyExhaustionTimerRef.current = exhaustionDuration;
              setEnemyExhausted(true);
            }
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

        // 8. Enemy AI Sumo Push (Heavy Shove Attack when in physical contact)
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

    // Enemy Stamina handling (Locks to 0 during exhaustion or drains/regenerates when active)
    if (!isEnemyExhausted) {
      if (aiIsMoving) {
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

    // Imperative mesh rotations
    if (playerVisualRef.current) {
      playerVisualRef.current.rotation.y = playerHeadingRef.current;
    }
    if (enemyVisualRef.current) {
      enemyVisualRef.current.rotation.y = enemyHeadingRef.current;
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
        <group ref={playerVisualRef}>
          <SumoCubeVisual
            color="#0284c7"
            beltColor="#eab308"
            isPlayer={true}
            isExhausted={playerExhausted}
            isStunned={playerStunned}
          />
        </group>
      </RigidBody>

      {/* AI Enemy Sumo Cube */}
      <RigidBody
        ref={enemyBodyRef}
        position={[0, 1.5, -6]}
        colliders="cuboid"
        mass={2.0}
        friction={0.4}
        restitution={0.3}
        enabledRotations={[false, true, false]}
        name="enemy-sumo">
        <group ref={enemyVisualRef}>
          <SumoCubeVisual
            color="#e11d48"
            beltColor="#1e293b"
            isPlayer={false}
            isExhausted={enemyExhausted}
            isStunned={enemyStunned}
          />
        </group>
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
