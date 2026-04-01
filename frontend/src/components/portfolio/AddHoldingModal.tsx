'use client';

import { useState } from 'react';
import { usePortfolioStore } from '@/stores/portfolio.store';

interface AddHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddHoldingModal({ isOpen, onClose }: AddHoldingModalProps) {
  const { addHolding } = usePortfolioStore();
  const [form, setForm] = useState({
    symbol: '',
    quantity: '',
    avgBuyPrice: '',
    buyDate: new Date().toISOString().split('T')[0],
    stopLoss: '',
    targetPrice: '',
    notes: '',
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addHolding({
      symbol: form.symbol.toUpperCase(),
      quantity: Number(form.quantity),
      avgBuyPrice: Number(form.avgBuyPrice),
      buyDate: form.buyDate,
      stopLoss: form.stopLoss ? Number(form.stopLoss) : undefined,
      targetPrice: form.targetPrice ? Number(form.targetPrice) : undefined,
      notes: form.notes,
    });
    setForm({
      symbol: '',
      quantity: '',
      avgBuyPrice: '',
      buyDate: new Date().toISOString().split('T')[0],
      stopLoss: '',
      targetPrice: '',
      notes: '',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Add Holding</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input label="Symbol" value={form.symbol} onChange={(v) => setForm({ ...form, symbol: v })} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} required />
            <Input label="Avg Buy Price" type="number" value={form.avgBuyPrice} onChange={(v) => setForm({ ...form, avgBuyPrice: v })} required />
          </div>
          <Input label="Buy Date" type="date" value={form.buyDate} onChange={(v) => setForm({ ...form, buyDate: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Stop Loss" type="number" value={form.stopLoss} onChange={(v) => setForm({ ...form, stopLoss: v })} />
            <Input label="Target Price" type="number" value={form.targetPrice} onChange={(v) => setForm({ ...form, targetPrice: v })} />
          </div>
          <Input label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add Holding
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Input({
  label,
  type = 'text',
  value,
  onChange,
  required = false,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        step={type === 'number' ? 'any' : undefined}
        className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
