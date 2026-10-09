// tslint:disable
/* eslint-disable */
import {useCallback, useEffect, useRef, useState} from 'react';

export function usePlayground() {
  const [isReady, setIsReady] = useState(false);
  const sdkRef = useRef<any>(null);

  const onGameEventRef = useRef<((event: any) => void) | null>(null);
  const onPresenceEventRef = useRef<((presence: any) => void) | null>(null);
  const onLobbyStatusRef = useRef<((status: any) => void) | null>(null);

  useEffect(() => {
    if (sdkRef.current) return;

    const loadScript = () => {
      return new Promise<void>((resolve, reject) => {
        if ((window as any).PlaygroundSDK) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src =
          'https://www.gstatic.com/play/games/playground/sdk/dev/v1/playground.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error('Failed to load Playground SDK script'));
        document.head.appendChild(script);
      });
    };

    const initSDK = async () => {
      try {
        const isSandboxPreview =
          window.location.hostname === 'test.com' ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname === '::1' ||
          (window as any).__PLAYGROUND_PREVIEW__ === true;

        if (isSandboxPreview) {
          const module = await import('./playground-fake');
          (window as any).PlaygroundSDK = module.FakePlaygroundSDK;
        } else {
          await loadScript();
        }

        if ((window as any).PlaygroundSDK) {
          sdkRef.current = new (window as any).PlaygroundSDK();

          await sdkRef.current.init(
            (event: any) => onGameEventRef.current?.(event),
            (presence: any) => onPresenceEventRef.current?.(presence),
            (status: any) => onLobbyStatusRef.current?.(status),
          );

          setIsReady(true);
        } else {
          console.error('Playground SDK class not found after script load.');
        }
      } catch (error) {
        console.error('Playground SDK initialization failed:', error);
      }
    };

    initSDK();
  }, []);

  return {
    sdk: sdkRef.current,
    isReady,
    onGameEventRef,
    onPresenceEventRef,
    onLobbyStatusRef,
  };
}

export interface BaseGameState {
  status: string;
  score: number;
  level?: number | string;
}

export function usePlaygroundGameLifecycle(
  gameState: BaseGameState,
  sdk?: any,
) {
  const defaultHook = usePlayground();
  const activeSdk = sdk ?? defaultHook.sdk;
  const hasCalledGameOver = useRef(false);
  const hasCalledLevelComplete = useRef(false);
  const lastScoreRef = useRef(gameState.score);
  const lastLevelRef = useRef(gameState.level);
  const lastIsPausedRef = useRef(false);

  lastScoreRef.current = gameState.score;
  lastLevelRef.current = gameState.level;

  useEffect(() => {
    if (!activeSdk) return;

    const status = (gameState.status || '').toUpperCase();
    const isGameOver =
      status === 'GAME_OVER' || status === 'DEFEAT' || status === 'LOST';
    const isLevelComplete =
      status === 'VICTORY' || status === 'WIN' || status === 'LEVEL_COMPLETE';
    const currentLevel = gameState.level ?? 1;

    const isPaused = status === 'PAUSED' || status === 'PAUSE';
    if (lastIsPausedRef.current !== isPaused) {
      if (typeof activeSdk.pauseStateChanged === 'function') {
        activeSdk.pauseStateChanged(isPaused);
      }
      lastIsPausedRef.current = isPaused;
    }

    if (status === 'PLAYING') {
      activeSdk.scoreUpdated({
        value: gameState.score,
        level: String(currentLevel),
      });
      hasCalledGameOver.current = false;
      hasCalledLevelComplete.current = false;
    } else if (isGameOver) {
      if (!hasCalledGameOver.current) {
        activeSdk.scoreUpdated({
          value: gameState.score,
          level: String(currentLevel),
        });
        activeSdk.gameOver();
        hasCalledGameOver.current = true;
      }
    } else if (isLevelComplete) {
      if (!hasCalledLevelComplete.current) {
        activeSdk.scoreUpdated({
          value: gameState.score,
          level: String(currentLevel),
        });
        activeSdk.levelComplete(currentLevel);
        hasCalledLevelComplete.current = true;
      }
    }
  }, [gameState.score, gameState.status, gameState.level, activeSdk]);

  useEffect(() => {
    return () => {
      if (
        activeSdk &&
        !hasCalledGameOver.current &&
        !hasCalledLevelComplete.current &&
        lastScoreRef.current > 0
      ) {
        try {
          const levelToReport = lastLevelRef.current ?? 1;
          activeSdk.scoreUpdated({
            value: lastScoreRef.current,
            level: String(levelToReport),
          });
          activeSdk.gameOver();
        } catch (_) {}
      }
    };
  }, [activeSdk]);
}

export function useRpc<RequestType, ResponseType>(
  rpcName: string,
): [(payload: RequestType) => Promise<ResponseType>, boolean] {
  const [isLoading, setIsLoading] = useState(false);
  const resolvers = useRef<Map<string, (resp: any) => void>>(new Map()).current;
  const rejecters = useRef<Map<string, (err: Error) => void>>(
    new Map(),
  ).current;

  useEffect(() => {
    const handleResponse = (event: MessageEvent<any>) => {
      const response = event.data;
      if (
        response &&
        response.messageId &&
        (resolvers.has(response.messageId) || rejecters.has(response.messageId))
      ) {
        if (response.success) {
          resolvers.get(response.messageId)?.(response.payload);
        } else {
          rejecters.get(response.messageId)?.(
            new Error(response.error ?? 'Unknown RPC error'),
          );
        }
        resolvers.delete(response.messageId);
        rejecters.delete(response.messageId);
      }
    };

    window.addEventListener('message', handleResponse);
    return () => {
      window.removeEventListener('message', handleResponse);
    };
  }, [resolvers, rejecters]);

  const callRpc = useCallback(
    (payload: RequestType): Promise<ResponseType> => {
      setIsLoading(true);
      const promise = new Promise<ResponseType>((resolve, reject) => {
        const messageId = `rpc-${Date.now()}-${Math.random()}`;
        resolvers.set(messageId, resolve);
        rejecters.set(messageId, reject);

        const message = {
          type: rpcName,
          payload,
          messageId,
        };
        window.parent.postMessage(message, '*');
      });
      promise.finally(() => {
        setIsLoading(false);
      });
      return promise;
    },
    [rpcName, resolvers, rejecters],
  );

  return [callRpc, isLoading];
}
