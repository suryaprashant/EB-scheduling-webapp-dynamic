import React from 'react';
import { Zap, Calendar, LayoutDashboard } from 'lucide-react';
import { EvChargerThumbnail } from './BatteryVisual';

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  sessionCount: number;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onTabChange, sessionCount }) => {
  const tabs = [
    { id: 'allocate', label: 'Allocate', icon: Zap },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'schedule', label: 'Schedule', icon: Calendar, badge: sessionCount },
    { id: 'chargers', label: 'Chargers', isChargerTab: true, badge: '20' },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E4F3EA] flex items-center justify-center p-1.5 shadow-xs border border-emerald-100">
              <EvChargerThumbnail className="w-full h-full object-contain" alt="DepotCharge" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold tracking-widest text-[#718078] uppercase block">
                DepotCharge Dynamic
              </span>
              <span className="text-sm font-bold text-[#183129] block -mt-0.5">
                Workbook-Driven Charger Scheduling
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[#1A6B52] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab.isChargerTab ? (
                    <div className="w-5 h-5 flex items-center justify-center rounded-md overflow-hidden flex-shrink-0">
                      <EvChargerThumbnail
                        invertWhite={isActive}
                        className="w-full h-full object-contain"
                        alt="Chargers Tab"
                      />
                    </div>
                  ) : (
                    Icon && <Icon className="w-4 h-4" />
                  )}
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
