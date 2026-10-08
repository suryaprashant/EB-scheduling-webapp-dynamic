import React, { useState } from 'react';
import { ChargeSession } from '../types';
import { formatTime24, formatTime12 } from '../engine/chargingAllocationEngine';
import { BatteryVisual, EvBatteryThumbnail, EvChargerThumbnail, EvBusThumbnail, VectorBatteryChargePic } from './BatteryVisual';
import { AlertTriangle, Battery, Bus, CalendarDays, Plus, PlugZap, Search, Trash2, Zap } from 'lucide-react';

interface ScheduleViewProps {
  sessions: ChargeSession[];
  onDeleteSession: (id: string) => void;
  onAddSession: (session: ChargeSession) => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ sessions, onDeleteSession, onAddSession }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // New session inputs
  const [newBus, setNewBus] = useState('');
  const [newCharger, setNewCharger] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDuration, setNewDuration] = useState('50');

  // Find overlaps
  const overlaps: Array<[ChargeSession, ChargeSession]> = [];
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i];
      const b = sessions[j];
      const overlap = a.startMinute < b.endMinute && b.startMinute < a.endMinute;
      if (overlap && (a.charger === b.charger || a.bus === b.bus)) {
        overlaps.push([a, b]);
      }
    }
  }

  const conflictedIds = new Set(overlaps.flatMap(([a, b]) => [a.id, b.id]));

  const filtered = sessions
    .filter(s => {
      if (filter === 'issues') return conflictedIds.has(s.id);
      return true;
    })
    .filter(s => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        s.bus.toString().includes(q) ||
        s.charger.toString().includes(q) ||
        formatTime24(s.startMinute).includes(q)
      );
    })
    .sort((a, b) => a.startMinute - b.startMinute);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const b = parseInt(newBus, 10);
    const c = parseInt(newCharger, 10);
    const d = parseInt(newDuration, 10);
    const [hStr, mStr] = newTime.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    if (!b || !c || !d || isNaN(h) || isNaN(m)) return;

    const startMinute = h * 60 + m;
    const endMinute = startMinute + d;

    onAddSession({
      id: `manual-${Date.now()}`,
      bus: b,
      charger: c,
      startMinute,
      endMinute,
      durationMinutes: d,
    });

    setShowAddModal(false);
    setNewBus('');
    setNewCharger('');
    setNewTime('');
  };

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-200 shadow-xs bg-[#E4F3EA] p-1">
            <VectorBatteryChargePic soc={85} size="sm" isCharging showPercentageText={false} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Depot Charge Plan</h2>
            <p className="text-xs text-gray-500">
              {sessions.length} planned sessions across 20 chargers · 240 kW DC fast charging
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-[#1A6B52] hover:bg-[#145541] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Session
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bus, charger or time..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1A6B52]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              filter === 'all'
                ? 'bg-[#1A6B52] text-white border-[#1A6B52]'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Sessions ({sessions.length})
          </button>
          <button
            onClick={() => setFilter('issues')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              filter === 'issues'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-amber-800 border-gray-200 hover:bg-amber-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Overlaps ({overlaps.length})
          </button>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
              <tr>
                <th className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0 bg-white border border-gray-200">
                      <EvBusThumbnail className="w-full h-full object-cover" />
                    </div>
                    Bus
                  </span>
                </th>
                <th className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-xs overflow-hidden flex-shrink-0 bg-white border border-gray-200">
                      <EvChargerThumbnail className="w-full h-full object-contain" />
                    </div>
                    Charger
                  </span>
                </th>
                <th className="px-5 py-3">Start Time</th>
                <th className="px-5 py-3">End Time</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3"><span className="inline-flex items-center gap-1.5"><Battery className="h-4 w-4 text-[#1A6B52]" aria-hidden="true" />Est. SOC Gain</span></th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {filtered.map(session => {
                const isConflict = conflictedIds.has(session.id);
                const estSocGain = Math.min(100, (session.durationMinutes / 60) * (240 / 360) * 0.95 * 100);
                return (
                  <tr key={session.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3 font-bold text-gray-900">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex h-14 w-14 items-center justify-center rounded-xl overflow-hidden border border-emerald-200 bg-white">
                          <EvBusThumbnail className="w-full h-full object-cover" alt={`Bus ${session.bus}`} />
                        </span>
                        Bus {session.bus.toString().padStart(2, '0')}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold text-[#1A6B52]">
                      <span className="inline-flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md overflow-hidden flex-shrink-0 bg-emerald-50 border border-emerald-200 p-0.5">
                          <EvChargerThumbnail className="w-full h-full object-contain" alt={`Charger ${session.charger}`} />
                        </div>
                        Charger {session.charger.toString().padStart(2, '0')}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {formatTime24(session.startMinute)}{' '}
                      <span className="text-[10px] text-gray-400">({formatTime12(session.startMinute)})</span>
                    </td>
                    <td className="px-5 py-3">
                      {formatTime24(session.endMinute)}{' '}
                      <span className="text-[10px] text-gray-400">({formatTime12(session.endMinute)})</span>
                    </td>
                    <td className="px-5 py-3 font-semibold">
                      {session.durationMinutes} min
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <BatteryVisual soc={estSocGain} size="xs" isCharging />
                        <span className="font-bold text-[#1A6B52] text-xs">
                          +{estSocGain.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {isConflict ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          <AlertTriangle className="w-3 h-3" /> Overlap
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Scheduled
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => onDeleteSession(session.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                        title="Delete session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Add Charge Session</h3>
            <p className="text-xs text-gray-500 mb-4">Manual assignment into the depot plan</p>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Bus Number (1–101)</label>
                <input
                  type="number"
                  required
                  value={newBus}
                  onChange={e => setNewBus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="e.g. 4"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Charger Number (1–20)</label>
                <input
                  type="number"
                  required
                  value={newCharger}
                  onChange={e => setNewCharger(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="e.g. 1"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Start Time (HH:mm)</label>
                <input
                  type="text"
                  required
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="20:00"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  required
                  value={newDuration}
                  onChange={e => setNewDuration(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="45"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#1A6B52] hover:bg-[#145541] rounded-xl"
                >
                  Save Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
