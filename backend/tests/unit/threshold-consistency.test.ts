import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DEFAULT_CCEP_THRESHOLD } from '../../src/ccep/constants.js';
import { computeCCEPScore } from '../../src/ccep/scorer.js';
import { BOOTSTRAP_DEFAULT_WEIGHTS } from '../../src/ccep/weights.js';
import { config } from '../../src/config/index.js';

describe('CCEP Threshold Consistency — Single Source of Truth', () => {
  it('DEFAULT_CCEP_THRESHOLD is exactly 0.32', () => {
    expect(DEFAULT_CCEP_THRESHOLD).toBe(0.32);
  });

  it('weights.json defines threshold equal to DEFAULT_CCEP_THRESHOLD', () => {
    const weightsPath = path.resolve(__dirname, '../../weights.json');
    expect(fs.existsSync(weightsPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(weightsPath, 'utf-8'));
    expect(content.threshold).toBe(DEFAULT_CCEP_THRESHOLD);
  });

  it('backend/.env.example defines CCEP_THRESHOLD equal to DEFAULT_CCEP_THRESHOLD', () => {
    const envExamplePath = path.resolve(__dirname, '../../.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    const match = content.match(/^CCEP_THRESHOLD\s*=\s*([0-9.]+)/m);
    expect(match).not.toBeNull();
    expect(parseFloat(match![1])).toBe(DEFAULT_CCEP_THRESHOLD);
  });

  it('docker-compose.yml defines CCEP_THRESHOLD equal to DEFAULT_CCEP_THRESHOLD', () => {
    const dockerComposePath = path.resolve(__dirname, '../../../docker-compose.yml');
    expect(fs.existsSync(dockerComposePath)).toBe(true);
    const content = fs.readFileSync(dockerComposePath, 'utf-8');
    const match = content.match(/CCEP_THRESHOLD:\s*"?([0-9.]+)"?/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![1])).toBe(DEFAULT_CCEP_THRESHOLD);
  });

  it('backend/prisma/schema.prisma sets Settings.ccepThreshold default to DEFAULT_CCEP_THRESHOLD', () => {
    const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    expect(fs.existsSync(schemaPath)).toBe(true);
    const content = fs.readFileSync(schemaPath, 'utf-8');
    const match = content.match(/ccepThreshold\s+Float\s+@default\(([0-9.]+)\)/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![1])).toBe(DEFAULT_CCEP_THRESHOLD);
  });

  it('computeCCEPScore defaults to DEFAULT_CCEP_THRESHOLD when threshold parameter is omitted', () => {
    // With default threshold 0.32: score of 0.35 (all uncertainty, no error/flags/risk)
    // using bootstrap weights w1=0.35: 0.35*(1-0.0) = 0.35 → ESCALATE (0.35 >= 0.32)
    const signals = {
      modelConfidence: 0.0, // (1 - 0) * 0.35 = 0.35
      historicalErrorRate: 0.0,
      guardrailFlagCount: 0,
      actionReversibilityWeight: 0.0,
    };
    const result = computeCCEPScore(signals, BOOTSTRAP_DEFAULT_WEIGHTS);
    expect(result.threshold).toBe(DEFAULT_CCEP_THRESHOLD);
    expect(result.decision).toBe('ESCALATE'); // 0.35 >= 0.32
  });

  it('backend config.ccepThreshold falls back to DEFAULT_CCEP_THRESHOLD', () => {
    // When process.env.CCEP_THRESHOLD is unset or set to 0.32
    expect([DEFAULT_CCEP_THRESHOLD, Number(process.env.CCEP_THRESHOLD || DEFAULT_CCEP_THRESHOLD)]).toContain(config.ccepThreshold);
  });
});
