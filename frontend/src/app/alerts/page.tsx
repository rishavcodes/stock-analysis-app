'use client';

import { useEffect, useState } from 'react';
import { useAlertStore } from '@/stores/alert.store';
import { formatDate } from '@/lib/format';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

const ALERT_TYPES = [
  'PRICE_ABOVE',
  'PRICE_BELOW',
  'VOLUME_SPIKE',
  'BREAKOUT',
  'STOP_LOSS',
  'TARGET_HIT',
  'SCORE_CHANGE',
];

export default function AlertsPage() {
  const { alerts, isLoading, fetchAlerts, createAlert, deleteAlert } = useAlertStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: '', type: 'PRICE_ABOVE', threshold: '' });
  const [tab, setTab] = useState<'active' | 'triggered'>('active');

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAlert({
      symbol: form.symbol.toUpperCase(),
      type: form.type,
      threshold: Number(form.threshold),
    });
    setForm({ symbol: '', type: 'PRICE_ABOVE', threshold: '' });
    setShowForm(false);
  };

  const activeAlerts = alerts.filter((a) => a.isActive && !a.isTriggered);
  const triggeredAlerts = alerts.filter((a) => a.isTriggered);
  const displayAlerts = tab === 'active' ? activeAlerts : triggeredAlerts;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Create Alert
        </button>
      </div>

      {/* Create Alert Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <input
            type="text"
            placeholder="Symbol (e.g., RELIANCE)"
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            required
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            {ALERT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Threshold"
            value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            required
            step="any"
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <button
            type="submit"
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Create
          </button>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-900 p-1">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Active ({activeAlerts.length})
        </button>
        <button
          onClick={() => setTab('triggered')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'triggered' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Triggered ({triggeredAlerts.length})
        </button>
      </div>

      {/* Alert List */}
      {isLoading ? (
        <LoadingSpinner />
      ) : displayAlerts.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-500">
          No {tab} alerts.
        </div>
      ) : (
        <div className="space-y-2">
          {displayAlerts.map((alert) => (
            <div
              key={alert._id}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{alert.symbol}</span>
                  <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                    {alert.type.replace(/_/g, ' ')}
                  </span>
                  {alert.isTriggered && (
                    <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                      TRIGGERED
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Threshold: {alert.threshold}
                  {alert.triggeredAt && ` | Triggered: ${formatDate(alert.triggeredAt)}`}
                </div>
                {alert.message && (
                  <p className="mt-1 text-xs text-gray-400">{alert.message}</p>
                )}
              </div>
              <button
                onClick={() => deleteAlert(alert._id)}
                className="rounded px-3 py-1 text-xs text-red-400 hover:bg-gray-800"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
