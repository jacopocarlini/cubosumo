import type {FighterSnapshot, MatchSnapshot, OnlineInput} from './protocol';

export function getViewFighters(snapshot: MatchSnapshot, seat: 0 | 1): [FighterSnapshot, FighterSnapshot] {
  const local = snapshot.players[seat];
  const opponent = snapshot.players[seat === 0 ? 1 : 0];
  if (seat === 0) return [local, opponent];
  const rotate = (fighter: FighterSnapshot): FighterSnapshot => ({
    ...fighter,
    position: {x: -fighter.position.x, y: fighter.position.y, z: -fighter.position.z},
    // Premultiply by the quaternion for a 180-degree rotation around Y.
    rotation: {
      x: fighter.rotation.z,
      y: fighter.rotation.w,
      z: -fighter.rotation.x,
      w: -fighter.rotation.y,
    },
  });
  return [rotate(local), rotate(opponent)];
}

export function toServerInput(input: OnlineInput, seat: 0 | 1): OnlineInput {
  if (seat === 0) return {...input};
  return {
    ...input,
    left: input.right,
    right: input.left,
    up: input.down,
    down: input.up,
  };
}
