import type { TerrainType } from '../core/types';

export interface TerrainConfig {
  type: TerrainType;
  moveCost: number;
  evasion: number;
  defense: number;
  color: string;
  label: string;
}

export const TERRAIN_CONFIGS: Record<TerrainType, TerrainConfig> = {
  plain: {
    type: 'plain',
    moveCost: 1,
    evasion: 0,
    defense: 0,
    color: '#4a7c4e',
    label: '平原'
  },
  forest: {
    type: 'forest',
    moveCost: 2,
    evasion: 20,
    defense: 1,
    color: '#2d5a3d',
    label: '森林'
  },
  mountain: {
    type: 'mountain',
    moveCost: Infinity,
    evasion: 0,
    defense: 0,
    color: '#6b6b6b',
    label: '山'
  },
  base: {
    type: 'base',
    moveCost: 1,
    evasion: 20,
    defense: 2,
    color: '#8b6914',
    label: '基地'
  }
};
