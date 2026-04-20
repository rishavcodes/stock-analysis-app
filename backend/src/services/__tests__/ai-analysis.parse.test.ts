import { describe, it, expect } from 'vitest';
import {
  extractJsonBlock,
  computeRiskReward,
  parseClaudeResponse,
  applyRiskRewardGuardrail,
} from '../ai-analysis.service';
import { AnalysisOutput } from '../../types/analysis.types';

const validOutput: AnalysisOutput = {
  recommendation: 'BUY',
  confidence: 72,
  summary: 'Strong breakout with volume confirmation.',
  bullishFactors: ['MA aligned', 'Volume spike'],
  bearishFactors: [],
  entryPrice: 1000,
  targetPrice: 1150,
  stopLoss: 950,
  timeHorizon: 'SHORT_TERM',
  reasoning: {
    market: 'Nifty bullish.',
    sector: 'IT strong.',
    technical: 'Breakout above 200DMA.',
    fundamental: 'ROE 22%, PE 24.',
    synthesis: 'High-quality setup with 3:1 R:R.',
  },
};

describe('extractJsonBlock', () => {
  it('extracts bare JSON', () => {
    const text = '{"a": 1}';
    expect(extractJsonBlock(text)).toBe('{"a": 1}');
  });

  it('extracts JSON with surrounding prose', () => {
    const text = 'Here is the analysis:\n{"a": 1, "b": "x"}\nLet me know if you need more.';
    expect(extractJsonBlock(text)).toBe('{"a": 1, "b": "x"}');
  });

  it('extracts JSON from a ```json fenced block', () => {
    const text = '```json\n{"a": 1}\n```';
    expect(extractJsonBlock(text)).toBe('{"a": 1}');
  });

  it('extracts JSON from a bare ``` fenced block', () => {
    const text = '```\n{"a": 2}\n```';
    expect(extractJsonBlock(text)).toBe('{"a": 2}');
  });

  it('returns null when no JSON is present', () => {
    expect(extractJsonBlock('no json here')).toBeNull();
  });
});

describe('computeRiskReward', () => {
  it('returns reward/risk for valid levels', () => {
    expect(computeRiskReward(100, 130, 90)).toBeCloseTo(3, 5);
    expect(computeRiskReward(1000, 1150, 950)).toBeCloseTo(3, 5);
  });

  it('returns null when any level is null', () => {
    expect(computeRiskReward(null, 130, 90)).toBeNull();
    expect(computeRiskReward(100, null, 90)).toBeNull();
    expect(computeRiskReward(100, 130, null)).toBeNull();
  });

  it('returns null when target <= entry or stop >= entry', () => {
    expect(computeRiskReward(100, 90, 80)).toBeNull();
    expect(computeRiskReward(100, 130, 110)).toBeNull();
    expect(computeRiskReward(100, 100, 90)).toBeNull();
  });
});

describe('parseClaudeResponse', () => {
  it('parses a clean JSON payload', () => {
    const text = JSON.stringify(validOutput);
    const parsed = parseClaudeResponse(text);
    expect(parsed.recommendation).toBe('BUY');
    expect(parsed.confidence).toBe(72);
    expect(parsed.reasoning?.synthesis).toContain('3:1 R:R');
  });

  it('parses JSON with surrounding prose', () => {
    const text = `Sure, here's my analysis:\n\n${JSON.stringify(validOutput)}\n\nHope this helps.`;
    const parsed = parseClaudeResponse(text);
    expect(parsed.recommendation).toBe('BUY');
  });

  it('parses JSON inside a fenced block', () => {
    const text = `\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\``;
    const parsed = parseClaudeResponse(text);
    expect(parsed.recommendation).toBe('BUY');
  });

  it('throws when JSON is absent', () => {
    expect(() => parseClaudeResponse('no json here')).toThrow();
  });

  it('throws when schema is violated (invalid recommendation)', () => {
    const bad = { ...validOutput, recommendation: 'MAYBE' };
    expect(() => parseClaudeResponse(JSON.stringify(bad))).toThrow();
  });

  it('throws when confidence is out of range', () => {
    const bad = { ...validOutput, confidence: 150 };
    expect(() => parseClaudeResponse(JSON.stringify(bad))).toThrow();
  });
});

describe('applyRiskRewardGuardrail', () => {
  it('leaves BUY unchanged when R:R >= 2', () => {
    const result = applyRiskRewardGuardrail(validOutput);
    expect(result.recommendation).toBe('BUY');
    expect(result.reasoning?.synthesis).not.toContain('Auto-downgraded');
  });

  it('downgrades BUY to WATCH when R:R < 2', () => {
    const low = { ...validOutput, entryPrice: 1000, targetPrice: 1080, stopLoss: 950 };
    const result = applyRiskRewardGuardrail(low);
    expect(result.recommendation).toBe('WATCH');
    expect(result.reasoning?.synthesis).toContain('Auto-downgraded');
    expect(result.reasoning?.synthesis).toContain('1.60');
  });

  it('downgrades BUY to WATCH when any level is null', () => {
    const missing = { ...validOutput, targetPrice: null };
    const result = applyRiskRewardGuardrail(missing);
    expect(result.recommendation).toBe('WATCH');
    expect(result.reasoning?.synthesis).toContain('Auto-downgraded');
  });

  it('does not touch WATCH recommendations', () => {
    const watch: AnalysisOutput = { ...validOutput, recommendation: 'WATCH', targetPrice: null, stopLoss: null };
    const result = applyRiskRewardGuardrail(watch);
    expect(result.recommendation).toBe('WATCH');
    expect(result.reasoning?.synthesis).not.toContain('Auto-downgraded');
  });

  it('does not touch AVOID recommendations', () => {
    const avoid: AnalysisOutput = { ...validOutput, recommendation: 'AVOID', targetPrice: null, stopLoss: null };
    const result = applyRiskRewardGuardrail(avoid);
    expect(result.recommendation).toBe('AVOID');
  });

  it('preserves existing synthesis text when appending downgrade note', () => {
    const low = { ...validOutput, entryPrice: 1000, targetPrice: 1080, stopLoss: 950 };
    const result = applyRiskRewardGuardrail(low);
    expect(result.reasoning?.synthesis).toContain('High-quality setup');
    expect(result.reasoning?.synthesis).toContain('Auto-downgraded');
  });
});
