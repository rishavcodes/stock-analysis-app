'use client';

import { useEffect, useState } from 'react';
import { Analysis, DecisionTrace } from '@/types';
import { useStockStore } from '@/stores/stock.store';
import { getRecommendationColor, formatINR, formatDate } from '@/lib/format';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import api from '@/lib/api';

interface AIAnalysisProps {
  analysis: Analysis | null;
  symbol: string;
}

export default function AIAnalysis({ analysis, symbol }: AIAnalysisProps) {
  const { triggerAnalysis } = useStockStore();
  const [loading, setLoading] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<Analysis | null>(analysis);
  const [trace, setTrace] = useState<DecisionTrace | null>(null);

  const handleAnalyze = async (force = false) => {
    setLoading(true);
    setTrace(null);
    const result = await triggerAnalysis(symbol, force);
    if (result) setCurrentAnalysis(result);
    setLoading(false);
  };

  useEffect(() => {
    if (!currentAnalysis?._id) return;
    let cancelled = false;
    api
      .get(`/stocks/analysis/${currentAnalysis._id}/trace`)
      .then((res) => {
        if (!cancelled) setTrace(res.data.data.decisionTrace ?? null);
      })
      .catch(() => {
        if (!cancelled) setTrace(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentAnalysis?._id]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-400">AI Analysis</h3>
        <div className="flex flex-col items-center gap-2 py-8">
          <LoadingSpinner />
          <span className="text-sm text-gray-500">Analyzing with Claude AI...</span>
        </div>
      </div>
    );
  }

  if (!currentAnalysis) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-400">AI Analysis</h3>
        <p className="mb-3 text-sm text-gray-500">No analysis available for this stock.</p>
        <button
          onClick={() => handleAnalyze()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Generate AI Analysis
        </button>
      </div>
    );
  }

  const recColor = getRecommendationColor(currentAnalysis.recommendation);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400">AI Analysis</h3>
        <button
          onClick={() => handleAnalyze(true)}
          className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>

      {/* Recommendation Badge */}
      <div className="mb-4 flex items-center gap-3">
        <span className={`rounded-md border px-3 py-1.5 text-lg font-bold ${recColor}`}>
          {currentAnalysis.recommendation}
        </span>
        <div>
          <div className="text-sm text-gray-400">
            Confidence: <span className="font-medium text-white">{currentAnalysis.confidence}%</span>
          </div>
          <div className="text-xs text-gray-500">{currentAnalysis.timeHorizon.replace('_', ' ')}</div>
        </div>
      </div>

      {/* Summary */}
      <p className="mb-4 text-sm leading-relaxed text-gray-300">{currentAnalysis.summary}</p>

      {/* Entry/Target/SL */}
      {(currentAnalysis.entryPrice || currentAnalysis.targetPrice || currentAnalysis.stopLoss) && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {currentAnalysis.entryPrice && (
            <div className="rounded-md bg-gray-800/50 p-2 text-center">
              <div className="text-xs text-gray-500">Entry</div>
              <div className="font-medium text-blue-400">{formatINR(currentAnalysis.entryPrice)}</div>
            </div>
          )}
          {currentAnalysis.targetPrice && (
            <div className="rounded-md bg-gray-800/50 p-2 text-center">
              <div className="text-xs text-gray-500">Target</div>
              <div className="font-medium text-green-400">{formatINR(currentAnalysis.targetPrice)}</div>
            </div>
          )}
          {currentAnalysis.stopLoss && (
            <div className="rounded-md bg-gray-800/50 p-2 text-center">
              <div className="text-xs text-gray-500">Stop Loss</div>
              <div className="font-medium text-red-400">{formatINR(currentAnalysis.stopLoss)}</div>
            </div>
          )}
        </div>
      )}

      {/* Bull/Bear Factors */}
      <div className="grid grid-cols-2 gap-3">
        {currentAnalysis.bullishFactors.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-green-400">Bullish Factors</h4>
            <ul className="space-y-1">
              {currentAnalysis.bullishFactors.map((f, i) => (
                <li key={i} className="flex items-start gap-1 text-xs text-gray-400">
                  <span className="mt-0.5 text-green-500">+</span> {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {currentAnalysis.bearishFactors.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-red-400">Bearish Factors</h4>
            <ul className="space-y-1">
              {currentAnalysis.bearishFactors.map((f, i) => (
                <li key={i} className="flex items-start gap-1 text-xs text-gray-400">
                  <span className="mt-0.5 text-red-500">-</span> {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Reasoning (5-step) */}
      {currentAnalysis.reasoning && (
        <details className="mt-4 rounded-md border border-gray-800 bg-gray-950/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-200">
            Reasoning
          </summary>
          <dl className="mt-3 space-y-2 text-xs">
            {(['market', 'sector', 'technical', 'fundamental', 'synthesis'] as const).map((key) =>
              currentAnalysis.reasoning?.[key] ? (
                <div key={key}>
                  <dt className="mb-0.5 font-medium uppercase tracking-wide text-gray-500">{key}</dt>
                  <dd className="whitespace-pre-line leading-relaxed text-gray-300">
                    {currentAnalysis.reasoning[key]}
                  </dd>
                </div>
              ) : null
            )}
          </dl>
        </details>
      )}

      {/* Decision trace */}
      {trace && (
        <details className="mt-3 rounded-md border border-gray-800 bg-gray-950/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-200">
            Decision trace
          </summary>
          <div className="mt-3 space-y-2 text-xs text-gray-300">
            <div>
              <span className="text-gray-500">Regime:</span>{' '}
              <span className="font-medium">{trace.regimeDetected ?? 'n/a'}</span>
              {trace.weightsUsed && (
                <span className="ml-3 text-gray-500">
                  Weights: M{(trace.weightsUsed.market * 100).toFixed(0)}% /
                  S{(trace.weightsUsed.sector * 100).toFixed(0)}% /
                  F{(trace.weightsUsed.fundamental * 100).toFixed(0)}% /
                  T{(trace.weightsUsed.technical * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div>
              <span className="text-gray-500">Sub-scores:</span>{' '}
              market {trace.subScoresAtTime.market} · sector {trace.subScoresAtTime.sector} ·
              fundamental {trace.subScoresAtTime.fundamental} · technical {trace.subScoresAtTime.technical}
              {trace.subScoresAtTime.risk != null && <> · risk {trace.subScoresAtTime.risk}</>}
            </div>
            {trace.riskFactors && (
              <div className="text-gray-400">
                Risk: vol {(trace.riskFactors.volatility20d * 100).toFixed(2)}% ·
                maxDD {(trace.riskFactors.maxDrawdown90d * 100).toFixed(1)}% ·
                ATR {trace.riskFactors.atr14.toFixed(2)}
              </div>
            )}
            <div className="text-gray-400">
              Nifty: {trace.niftyTrend} · {trace.sectorStrength}
            </div>
          </div>
        </details>
      )}

      <div className="mt-3 text-xs text-gray-600">
        Analyzed: {formatDate(currentAnalysis.analysisDate)}
      </div>
    </div>
  );
}
