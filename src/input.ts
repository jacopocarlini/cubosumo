import {useEffect, useRef, type MutableRefObject, type RefObject} from 'react';
import type {GameMode} from './utils/helper';

export type InputAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'confirm'
  | 'cancel'
  | 'tap';

export interface PointerState {
  nx: number;
  ny: number;
  clientX: number;
  clientY: number;
  down: boolean;
}

export interface InputSnapshot {
  actions: Record<InputAction, boolean>;
  player2Actions: Record<InputAction, boolean>;
  pointer: PointerState;
}

const SINGLE_PLAYER_KEYS: Record<string, InputAction> = {
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  ' ': 'jump',
};

const LOCAL_PLAYER_ONE_KEYS: Record<string, InputAction> = {
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  c: 'jump',
  C: 'jump',
  v: 'confirm',
  V: 'confirm',
};

const PLAYER_TWO_KEYS: Record<string, InputAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ',': 'jump',
  '.': 'confirm',
};

function createEmptyActions(): Record<InputAction, boolean> {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    confirm: false,
    cancel: false,
    tap: false,
  };
}

function getPointerNDC(
  event: PointerEvent,
  container: HTMLElement,
): {nx: number; ny: number; clientX: number; clientY: number} {
  const rect = container.getBoundingClientRect();
  const clientX = event.clientX - rect.left;
  const clientY = event.clientY - rect.top;
  const nx = (clientX / rect.width) * 2 - 1;
  const ny = -(clientY / rect.height) * 2 + 1;
  return {nx, ny, clientX, clientY};
}

export function useInput(
  containerRef: RefObject<HTMLDivElement>,
  options: {enabled?: boolean; gameMode?: GameMode} = {},
): MutableRefObject<InputSnapshot> {
  const {enabled = true, gameMode = 'single-player'} = options;
  const localMultiplayer = gameMode === 'local-multiplayer';
  const inputRef = useRef<InputSnapshot>({
    actions: createEmptyActions(),
    player2Actions: createEmptyActions(),
    pointer: {nx: 0, ny: 0, clientX: 0, clientY: 0, down: false},
  });

  useEffect(() => {
    if (!enabled) {
      inputRef.current.actions = createEmptyActions();
      inputRef.current.player2Actions = createEmptyActions();
      inputRef.current.pointer = {
        nx: 0,
        ny: 0,
        clientX: 0,
        clientY: 0,
        down: false,
      };
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const playerOneKeys = localMultiplayer
        ? LOCAL_PLAYER_ONE_KEYS
        : SINGLE_PLAYER_KEYS;
      const playerOneAction = playerOneKeys[event.key];
      const playerTwoAction = PLAYER_TWO_KEYS[event.key];
      const isPlayerTwoInput = Boolean(playerTwoAction && localMultiplayer);
      const action = isPlayerTwoInput ? playerTwoAction : playerOneAction;
      if (!action) return;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(
          event.key,
        )
      ) {
        event.preventDefault();
      }
      if (isPlayerTwoInput) {
        inputRef.current.player2Actions[action] = true;
      } else {
        inputRef.current.actions[action] = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const playerOneKeys = localMultiplayer
        ? LOCAL_PLAYER_ONE_KEYS
        : SINGLE_PLAYER_KEYS;
      const playerOneAction = playerOneKeys[event.key];
      const playerTwoAction = PLAYER_TWO_KEYS[event.key];
      if (playerTwoAction && localMultiplayer) {
        inputRef.current.player2Actions[playerTwoAction] = false;
      } else if (playerOneAction) {
        inputRef.current.actions[playerOneAction] = false;
      }
    };

    const container = containerRef.current;
    const handlePointerDown = (event: PointerEvent) => {
      if (!container || localMultiplayer) return;
      if (event.target instanceof Element && event.target.closest('button, input, a, form')) return;
      const pos = getPointerNDC(event, container);
      inputRef.current.pointer = {...pos, down: true};
      inputRef.current.actions.tap = true;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!container || localMultiplayer) return;
      const pos = getPointerNDC(event, container);
      inputRef.current.pointer = {...pos, down: inputRef.current.pointer.down};
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!container || localMultiplayer) return;
      const pos = getPointerNDC(event, container);
      inputRef.current.pointer = {...pos, down: false};
      inputRef.current.actions.tap = false;
    };

    const handleBlur = () => {
      inputRef.current.actions = createEmptyActions();
      inputRef.current.player2Actions = createEmptyActions();
      if (inputRef.current.pointer) {
        inputRef.current.pointer.down = false;
      }
      inputRef.current.actions.tap = false;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleBlur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (container) {
      container.addEventListener('pointerdown', handlePointerDown);
      container.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (container) {
        container.removeEventListener('pointerdown', handlePointerDown);
        container.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      }
    };
  }, [containerRef, enabled, localMultiplayer]);

  return inputRef;
}
