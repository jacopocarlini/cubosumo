import {useCallback, useEffect, useRef, useState, type MutableRefObject} from 'react';
import type {InputSnapshot} from '../input';
import type {ClientMessage, MatchSnapshot, ServerMessage} from './protocol';
import {toServerInput} from './perspective';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'queued';

export function useOnline(inputRef: MutableRefObject<InputSnapshot>, controlsEnabled: boolean) {
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [room, setRoom] = useState<{code: string; seat: 0 | 1} | null>(null);
  const seatRef = useRef<0 | 1>(0);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [notice, setNotice] = useState('');
  const controlsRef = useRef(controlsEnabled);
  controlsRef.current = controlsEnabled;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({type: 'leave'} satisfies ClientMessage));
    }
    socket?.close();
    setStatus('idle');
    setRoom(null);
    seatRef.current = 0;
    setSnapshot(null);
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setNotice('Not connected to the server.');
      return;
    }
    socketRef.current.send(JSON.stringify(message));
  }, []);

  const connect = useCallback((request: ClientMessage) => {
    disconnect();
    setNotice('');
    setStatus('connecting');
    const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL;
    const url = configuredUrl || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    if (!URL.canParse(url) || !['ws:', 'wss:'].includes(new URL(url).protocol)) {
      setStatus('idle');
      setNotice('VITE_MULTIPLAYER_URL must be a valid ws:// or wss:// URL.');
      return;
    }
    if (location.protocol === 'https:' && new URL(url).protocol !== 'wss:') {
      setStatus('idle');
      setNotice('HTTPS pages require a secure wss:// multiplayer URL.');
      return;
    }
    const socket = new WebSocket(url);
    let opened = false;
    socketRef.current = socket;
    const timeout = window.setTimeout(() => {
      if (socketRef.current !== socket || socket.readyState === WebSocket.OPEN) return;
      disconnect();
      setNotice('Connection timed out. Check that the multiplayer server is running.');
    }, 10000);
    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      opened = true;
      window.clearTimeout(timeout);
      setStatus('connected');
      socket.send(JSON.stringify(request));
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      if (socketRef.current !== socket) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        disconnect();
        setNotice('The multiplayer server sent an invalid response.');
        return;
      }
      if (!message || typeof message !== 'object' || !('type' in message)) {
        disconnect();
        setNotice('The multiplayer server sent an invalid response.');
        return;
      }
      switch (message.type) {
        case 'room':
          seatRef.current = message.seat;
          setRoom({code: message.code, seat: message.seat});
          setStatus('connected');
          setNotice('');
          break;
        case 'snapshot':
          setSnapshot(message);
          break;
        case 'queued':
          setStatus('queued');
          break;
        case 'error':
          setNotice(message.message);
          break;
        case 'opponent-left':
          disconnect();
          setNotice('Your opponent disconnected. Choose a new match.');
          break;
        case 'left':
          disconnect();
          break;
      }
    };
    socket.onerror = () => {
      if (socketRef.current === socket) setNotice('Unable to connect to the multiplayer server.');
    };
    socket.onclose = () => {
      window.clearTimeout(timeout);
      if (socketRef.current !== socket) return;
      disconnect();
      setNotice(opened
        ? 'Connection lost. Choose a new match to reconnect.'
        : 'Unable to connect. Check that the multiplayer server is running.');
    };
  }, [disconnect]);

  useEffect(() => {
    const sendInput = () => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN || snapshotRef.current?.phase !== 'playing') return;
      const {actions, pointer} = inputRef.current;
      const enabled = controlsRef.current;
      socket.send(JSON.stringify({
        type: 'input',
        input: toServerInput({
          left: enabled && actions.left,
          right: enabled && actions.right,
          up: enabled && actions.up,
          down: enabled && actions.down,
          jump: enabled && actions.jump,
          push: enabled && (actions.confirm || pointer.down),
        }, seatRef.current),
      } satisfies ClientMessage));
    };
    const handleInput = (event: Event) => {
      if (event instanceof KeyboardEvent && event.repeat) return;
      queueMicrotask(sendInput);
    };
    const events = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointercancel', 'blur'];
    events.forEach((event) => window.addEventListener(event, handleInput));
    const interval = window.setInterval(sendInput, 1000 / 30);
    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, handleInput));
    };
  }, [inputRef]);

  useEffect(() => () => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  return {status, room, snapshot, notice, connect, disconnect, send};
}
