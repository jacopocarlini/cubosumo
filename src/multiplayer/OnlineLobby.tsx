import {useState} from 'react';
import type {useOnline} from './useOnline';

export function OnlineLobby({online, onBack}: {
  online: ReturnType<typeof useOnline>;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const busy = online.status === 'connecting' || online.status === 'queued' || Boolean(online.room);
  const buttonClass = 'w-full py-3 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  return (
    <div className="w-full flex flex-col gap-3">
      <h2 className="text-xl font-black text-amber-300">ONLINE MULTIPLAYER</h2>
      <p className="text-sm text-slate-300">1 vs 1 · Three lives · WASD, Space and click</p>
      {online.room ? (
        <div className="bg-slate-800 p-4 rounded-xl">
          <p className="text-sm text-slate-300">Share this room code</p>
          <p className="text-3xl font-mono font-black tracking-widest text-amber-300 select-text">{online.room.code}</p>
          <p className="text-sm mt-2">Waiting for your opponent...</p>
        </div>
      ) : online.status === 'queued' ? (
        <p className="text-amber-300 animate-pulse py-4">Searching for an opponent...</p>
      ) : (
        <>
          <button className={buttonClass} disabled={busy} onClick={() => online.connect({type: 'queue'})}>FIND A MATCH</button>
          <button className={buttonClass} disabled={busy} onClick={() => online.connect({type: 'create'})}>CREATE PRIVATE ROOM</button>
          <form className="flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            online.connect({type: 'join', code: code.trim().toUpperCase()});
          }}>
            <input
              aria-label="Room code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ROOM CODE"
              disabled={busy}
              className="min-w-0 flex-1 rounded-xl bg-slate-950 border border-slate-600 px-3 py-3 font-mono uppercase select-text"
            />
            <button className={buttonClass + ' !w-auto'} disabled={busy || code.trim().length !== 6}>JOIN</button>
          </form>
        </>
      )}
      {online.status === 'connecting' && <p className="text-slate-300">Connecting...</p>}
      {online.notice && <p role="alert" className="text-sm text-rose-300">{online.notice}</p>}
      {busy && <button className={buttonClass} onClick={online.disconnect}>CANCEL</button>}
      <button className="py-2 font-bold text-slate-300 hover:text-white cursor-pointer" onClick={onBack}>BACK TO MODES</button>
    </div>
  );
}
