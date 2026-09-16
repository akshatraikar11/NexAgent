import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface CCEPWeights {
  w1: number; // model_confidence weight (0.35)
  w2: number; // historical_error_rate weight (0.25)
  w3: number; // guardrail_flag_count weight (0.20)
  w4: number; // action_reversibility_weight weight (0.20)
}

export const BOOTSTRAP_DEFAULT_WEIGHTS: CCEPWeights = {
  w1: 0.35,
  w2: 0.25,
  w3: 0.20,
  w4: 0.20,
};

export function loadCCEPWeights(customPath?: string): CCEPWeights {
  const filePath = customPath || path.resolve(process.cwd(), 'weights.json');

  try {
    if (fs.existsSync(filePath)) {
      const rawData = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(rawData);
      
      if (
        typeof parsed.w1 === 'number' &&
        typeof parsed.w2 === 'number' &&
        typeof parsed.w3 === 'number' &&
        typeof parsed.w4 === 'number'
      ) {
        logger.info(`[CCEP] Loaded weights from ${filePath}: w1=${parsed.w1}, w2=${parsed.w2}, w3=${parsed.w3}, w4=${parsed.w4}`);
        return {
          w1: parsed.w1,
          w2: parsed.w2,
          w3: parsed.w3,
          w4: parsed.w4,
        };
      } else {
        logger.warn(`[CCEP] Invalid weights format in ${filePath}. Using bootstrap defaults.`);
      }
    } else {
      logger.info(`[CCEP] weights.json not found at ${filePath}. Initializing bootstrap defaults.`);
    }
  } catch (error) {
    logger.error({ err: error }, `[CCEP] Failed to load weights from ${filePath}. Using bootstrap defaults.`);
  }

  return { ...BOOTSTRAP_DEFAULT_WEIGHTS };
}
