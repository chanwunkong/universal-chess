import { AI } from './ai';
import { Engine } from './engine';
import type { GameState, VariantDef } from './types';

export interface AIRequest {
  id: number;
  variant: VariantDef;
  state: GameState;
  level: 'easy' | 'normal' | 'hard';
}

const LEVELS = {
  easy: { time: 400, depth: 1, randomness: 1.5 },
  normal: { time: 1500, depth: 4, randomness: 0 },
  hard: { time: 5000, depth: 8, randomness: 0 },
};

self.onmessage = (ev: MessageEvent<AIRequest>) => {
  const { id, variant, state, level } = ev.data;
  const cfg = LEVELS[level];
  const move = new AI(new Engine(variant)).choose(state, cfg.time, cfg.depth, cfg.randomness);
  self.postMessage({ id, move });
};
