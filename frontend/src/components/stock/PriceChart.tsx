'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { Candle } from '@/types';

interface PriceChartProps {
  candles: Candle[];
  lastPrice?: number | null;
}

export default function PriceChart({ candles, lastPrice }: PriceChartProps) {
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

    // Build candle data — append today's live candle if we have a live price
    const candleData = candles.map((c) => ({
      time: c.timestamp.split('T')[0] as string,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    // Inject today's live price as a real-time candle update
    if (lastPrice != null && candles.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const lastCandleDate = candleData[candleData.length - 1].time;

      if (today > lastCandleDate) {
        // Today has no candle yet — add a new candle for today using live price
        const prevClose = candles[candles.length - 1].close;
        candleData.push({
          time: today,
          open: prevClose,
          high: Math.max(prevClose, lastPrice),
          low: Math.min(prevClose, lastPrice),
          close: lastPrice,
        });
      } else if (today === lastCandleDate) {
        // Today's candle exists — update its close with live price
        const todayCandle = candleData[candleData.length - 1];
        todayCandle.close = lastPrice;
        todayCandle.high = Math.max(todayCandle.high, lastPrice);
        todayCandle.low = Math.min(todayCandle.low, lastPrice);
      }
    }

    candleSeries.setData(candleData as any);

    // Add a horizontal price line at the live price
    if (lastPrice != null) {
      const prevClose = candles[candles.length - 1]?.close ?? lastPrice;
      const lineColor = lastPrice >= prevClose ? '#22C55E' : '#EF4444';

      candleSeries.createPriceLine({
        price: lastPrice,
        color: lineColor,
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'LTP',
      });
    }

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
  }, [candles, lastPrice]);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-400">Price Chart</h3>
      <div ref={chartContainerRef} />
    </div>
  );
}
