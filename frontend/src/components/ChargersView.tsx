import React from 'react';
import { ChargeSession } from '../types';
import { formatTime24 } from '../engine/chargingAllocationEngine';
import { BatteryVisual, EvBatteryThumbnail, EvChargerThumbnail, EvBusThumbnail } from './BatteryVisual';
import { Bus, PlugZap, Zap } from 'lucide-react';

interface ChargersViewProps {
  sessions: ChargeSession[];
}

export const ChargersView: React.FC<ChargersViewProps> = ({ sessions }) => {
  // Group sessions by charger 1..20
  const chargers = Array.from({ length: 20 }, (_, i) => {
    const chargerId = i + 1;
    const chargerSessions = sessions
      .filter(s => s.charger === chargerId)
      .sort((a, b) => a.startMinute - b.startMinute);
    return {
      id: chargerId,
      sessions: chargerSessions,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Depot Charger Terminals</h2>
        <p className="text-xs text-gray-500">
          20 high-power 240 kW DC charging points with assigned fleet schedules
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {chargers.map(charger => {
          return (
            <div
              key={charger.id}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between"
            >
              <div>
                <div className="relative mb-4 flex h-32 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#E4F3EA] via-[#F2FAF5] to-[#D5EBDD] group">
                  <div className="absolute -right-3 -top-8 h-32 w-32 rounded-full bg-white/50" />
                  
                  {/* Battery Pack Graphic Badge */}
                  <div className="absolute left-2.5 bottom-2.5 w-9 h-9 rounded-lg overflow-hidden border border-emerald-300 shadow-xs bg-white/90 p-0.5">
                    <EvBatteryThumbnail
                      isDeparture
                      alt="Battery Module"
                      className="group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>

                  <div className="relative h-20 w-20 flex items-center justify-center p-2 rounded-2xl bg-white/80 shadow-xs border border-emerald-100">
                    <EvChargerThumbnail
                      className="h-full w-full object-contain"
                      alt={`Charger ${charger.id}`}
                    />
                  </div>
                  <span className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-bold text-[#1A6B52] shadow-sm">
                    #{charger.id.toString().padStart(2, '0')}
                  </span>
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-[#1A6B52]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    DC FAST
                  </span>
                </div>

                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-gray-900 text-sm">
                    Charger {charger.id.toString().padStart(2, '0')}
                  </h3>
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                    {charger.sessions.length} sessions
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-3">240 kW Fast DC Charger</p>

                {/* Next upcoming sessions */}
                <div className="space-y-2 mt-2">
                  <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                    Schedule Queue
                  </span>
                  {charger.sessions.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No assigned sessions</p>
                  ) : (
                    charger.sessions.slice(0, 3).map(s => {
                      const estSoc = Math.min(100, Math.round(s.durationMinutes * 1.055));
                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-gray-50 border border-gray-100"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 font-bold text-gray-800">
                              <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 border border-emerald-100 bg-white">
                                <EvBusThumbnail className="w-full h-full object-cover" alt={`Bus ${s.bus}`} />
                              </div>
                              Bus {s.bus}
                            </span>
                            <BatteryVisual soc={estSoc} size="xs" isCharging />
                          </div>
                          <span className="text-gray-500 text-[11px]">
                            {formatTime24(s.startMinute)} – {formatTime24(s.endMinute)}
                          </span>
                        </div>
                      );
                    })
                  )}
                  {charger.sessions.length > 3 && (
                    <p className="text-[10px] text-gray-400 font-medium text-right">
                      +{charger.sessions.length - 3} more in queue
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
