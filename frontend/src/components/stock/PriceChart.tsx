'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { Candle } from '@/types';

interface PriceChartProps {
  candles: Candle[];
  sma20?: number[];
  sma50?: number[];
}

export default function PriceChart({ candles }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#111827' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: '#1F2937' },
        horzLines: { color: '#1F2937' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        borderColor: '#374151',
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderDownColor: '#EF4444',
      borderUpColor: '#22C55E',
      wickDownColor: '#EF4444',
      wickUpColor: '#22C55E',
    });

    const candleData = candles.map((c) => ({
      time: c.timestamp.split('T')[0] as string,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData as any);

    // Volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const volumeData = candles.map((c) => ({
      time: c.timestamp.split('T')[0] as string,
      value: c.volume,
      color: c.close >= c.open ? '#22C55E40' : '#EF444440',
    }));
    volumeSeries.setData(volumeData as any);

    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles]);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-400">Price Chart</h3>
      <div ref={chartContainerRef} />
    </div>
  );
}
