'use client';

import { useState } from 'react';

const SECTORS = [
  'All', 'IT', 'Banking', 'Financial Services', 'Pharma', 'Auto', 'FMCG',
  'Energy', 'Metals', 'Realty', 'Telecom', 'Infrastructure', 'Chemicals',
  'Cement', 'Oil & Gas', 'Power', 'Healthcare',
];

interface FilterBarProps {
  onFilter: (params: Record<string, any>) => void;
}

export default function FilterBar({ onFilter }: FilterBarProps) {
  const [sector, setSector] = useState('All');
  const [minScore, setMinScore] = useState(0);
  const [sortBy, setSortBy] = useState('finalScore');
  const [breakoutOnly, setBreakoutOnly] = useState(false);

  const handleApply = () => {
    const params: Record<string, any> = {
      sortBy,
      sortOrder: 'desc',
    };
    if (sector !== 'All') params.sector = sector;
    if (minScore > 0) params.minScore = minScore;
    if (breakoutOnly) params.breakoutOnly = true;
    onFilter(params);
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Sector</label>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
        >
          {SECTORS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Min Score: {minScore}</label>
        <input
          type="range"
          min={0}
          max={100}
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          className="w-32"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Sort By</label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
        >
          <option value="finalScore">Final Score</option>
          <option value="technicalScore">Technical Score</option>
          <option value="fundamentalScore">Fundamental Score</option>
          <option value="volume">Volume</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-400">
        <input
          type="checkbox"
          checked={breakoutOnly}
          onChange={(e) => setBreakoutOnly(e.target.checked)}
          className="rounded border-gray-600 bg-gray-800"
        />
        Breakout Only
      </label>
      <button
        onClick={handleApply}
        className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        Apply
      </button>
    </div>
  );
}
