import type { HexCoord } from './types';
import { directionBetween } from './hex';

export type PartSide = 'front' | 'side' | 'back';

/** 以守方朝向为基准判定攻击部位（§4.7：正面 3 格 / 侧面 2 格 / 背面 1 格） */
export function attackSide(
  defenderFacing: number,
  attackerPos: HexCoord,
  defenderPos: HexCoord
): PartSide {
  const dir = directionBetween(defenderPos, attackerPos);
  const d = (dir - defenderFacing + 6) % 6;
  if (d === 3) return 'back';
  if (d === 2 || d === 4) return 'side';
  return 'front';
}
