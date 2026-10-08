import React from 'react';
import { ChargerSnapshot } from '../types';
import { formatTime24 } from '../engine/chargingAllocationEngine';
import { BatteryVisual, EvChargerThumbnail, EvBusThumbnail } from './BatteryVisual';
import { Bus, PlugZap } from 'lucide-react';

interface ChargerStatusGridProps {
  minuteOfDay: number;
  snapshots: ChargerSnapshot[];
  allocatedChargerNumber: number | null;
}

export const ChargerStatusGrid: React.FC<ChargerStatusGridProps> = ({
  minuteOfDay,
  snapshots,
  allocatedChargerNumber,
}) => {
  const col1 = snapshots.slice(0, 10);
  const col2 = snapshots.slice(10, 20);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Depot Charger Status</h3>
          <p className="text-xs text-gray-500">
            Real-time status evaluated at arrival time
          </p>
        </div>
        <span className="bg-[#E4F3EA] text-[#1A6B52] text-xs font-bold px-3 py-1 rounded-full border border-[#C5E5D3]">
          Time: {formatTime24(minuteOfDay)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Column 1: Chg 1-10 */}
        <div className="space-y-1.5">
          {col1.map(snapshot => (
            <ChargerRow
              key={snapshot.chargerNumber}
              snapshot={snapshot}
              isAllocatedHere={allocatedChargerNumber === snapshot.chargerNumber}
            />
          ))}
        </div>

        {/* Column 2: Chg 11-20 */}
        <div className="space-y-1.5">
          {col2.map(snapshot => (
            <ChargerRow
              key={snapshot.chargerNumber}
              snapshot={snapshot}
              isAllocatedHere={allocatedChargerNumber === snapshot.chargerNumber}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const ChargerRow: React.FC<{ snapshot: ChargerSnapshot; isAllocatedHere: boolean }> = ({
  snapshot,
  isAllocatedHere,
}) => {
  const isIdle = snapshot.isIdle;

  let bgClass = 'bg-[#F4FAF6] border-gray-100';
  let badgeClass = 'bg-[#2E7D32] text-white';
  let text = 'Idle';

  if (isAllocatedHere) {
    bgClass = 'bg-[#E4F3EA] border-[#1A6B52] ring-1 ring-[#1A6B52]';
    badgeClass = 'bg-[#1A6B52] text-white font-bold';
    text = 'Allocated';
  } else if (!isIdle) {
    bgClass = 'bg-[#FFF3D9] border-[#F2D696]';
    badgeClass = 'bg-[#9A6517] text-white';
    text = `Bus ${snapshot.activeSession?.bus}`;
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${bgClass}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center p-1 rounded-lg border ${
          isAllocatedHere
            ? 'bg-emerald-50 border-emerald-300'
            : isIdle
              ? 'bg-white border-gray-200'
              : 'bg-amber-50 border-amber-200'
        }`}>
          <EvChargerThumbnail className="h-full w-full object-contain" />
        </span>
        <span className="truncate text-gray-800 font-semibold">
          Charger {snapshot.chargerNumber.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {!isIdle && (
          <BatteryVisual
            soc={isAllocatedHere ? 90 : 60}
            size="xs"
            isCharging
          />
        )}
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold ${badgeClass}`}>
          {!isIdle && (
            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-amber-300">
              <EvBusThumbnail className="w-full h-full object-cover" />
            </div>
          )}
          {text}
        </span>
      </div>
    </div>
  );
};
