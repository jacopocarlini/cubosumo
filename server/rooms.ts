import {randomInt} from 'node:crypto';
import type {ClientMessage, ServerMessage} from '../src/multiplayer/protocol.ts';
import {Match} from './physics.ts';

export interface Peer {
  send(message: ServerMessage): void;
}
interface Room {
  match: Match;
  peers: [Peer, Peer | null];
}
interface Membership {
  code: string;
  seat: 0 | 1;
}

export class Rooms {
  readonly rooms = new Map<string, Room>();
  private memberships = new Map<Peer, Membership>();
  private queue = new Set<Peer>();

  constructor(readonly maxRooms = 100) {}

  get queuedCount() { return this.queue.size; }

  handle(peer: Peer, message: ClientMessage) {
    if (message.type === 'leave') {
      this.leave(peer);
      peer.send({type: 'left'});
      return;
    }
    const membership = this.memberships.get(peer);
    if (message.type === 'input' || message.type === 'rematch') {
      if (!membership) return;
      const room = this.rooms.get(membership.code)!;
      if (message.type === 'input') room.match.setInput(membership.seat, message.input);
      else if (room.match.voteRematch(membership.seat)) this.broadcast(room);
      return;
    }
    if (membership || this.queue.has(peer)) {
      peer.send({type: 'error', message: 'Leave your current room or queue first.'});
      return;
    }
    if (message.type === 'create') {
      const room = this.create(peer);
      if (room) this.broadcast(room);
    } else if (message.type === 'join') {
      const room = this.rooms.get(message.code.toUpperCase());
      if (!room) peer.send({type: 'error', message: 'Room not found.'});
      else if (room.peers[1]) peer.send({type: 'error', message: 'Room is full.'});
      else this.join(peer, room);
    } else if (message.type === 'queue') {
      const opponent = this.queue.values().next().value as Peer | undefined;
      if (opponent) {
        // Reserve a room before removing the waiting player from the queue.
        const room = this.create(opponent, peer);
        if (room) {
          this.queue.delete(opponent);
          this.join(peer, room);
        }
      } else {
        if (this.rooms.size >= this.maxRooms) {
          peer.send({type: 'error', message: 'Server room capacity reached. Try again later.'});
          return;
        }
        this.queue.add(peer);
        peer.send({type: 'queued'});
      }
    }
  }

  private create(peer: Peer, errorRecipient = peer) {
    if (this.rooms.size >= this.maxRooms) {
      errorRecipient.send({type: 'error', message: 'Server room capacity reached. Try again later.'});
      return null;
    }
    let code: string;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
      code = Array.from({length: 6}, () => alphabet[randomInt(alphabet.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = {match: new Match(code), peers: [peer, null]};
    this.rooms.set(code, room);
    this.memberships.set(peer, {code, seat: 0});
    peer.send({type: 'room', code, seat: 0});
    return room;
  }

  private join(peer: Peer, room: Room) {
    room.peers[1] = peer;
    this.memberships.set(peer, {code: room.match.code, seat: 1});
    peer.send({type: 'room', code: room.match.code, seat: 1});
    room.match.start();
    this.broadcast(room);
  }

  leave(peer: Peer) {
    this.queue.delete(peer);
    const membership = this.memberships.get(peer);
    if (!membership) return;
    const room = this.rooms.get(membership.code)!;
    this.rooms.delete(membership.code);
    // Detach both seats before notifying the survivor, allowing an immediate new match.
    room.peers.forEach(player => { if (player) this.memberships.delete(player); });
    room.match.dispose();
    room.peers.forEach(player => {
      if (player && player !== peer) player.send({type: 'opponent-left'});
    });
  }

  step() {
    this.rooms.forEach(room => room.match.step());
  }

  broadcast(room: Room) {
    const snapshot = room.match.snapshot();
    room.peers.forEach(peer => peer?.send(snapshot));
  }

  snapshots() {
    this.rooms.forEach(room => this.broadcast(room));
  }

  dispose() {
    this.rooms.forEach(room => room.match.dispose());
    this.rooms.clear();
    this.memberships.clear();
    this.queue.clear();
  }
}
