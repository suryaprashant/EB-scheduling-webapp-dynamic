import React from 'react';
import { BatteryVisual, EvBatteryThumbnail } from './BatteryVisual';
import { Zap } from 'lucide-react';

interface SocDonutChartProps {
  title: string;
  socValue: number;
  color: string;
  subtitle?: string;
  size?: number;
  isDeparture?: boolean;
}

export const SocDonutChart: React.FC<SocDonutChartProps> = ({
  title,
  socValue,
  color,
  subtitle = 'SOC',
  size = 140,
  isDeparture = false,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(socValue * 10) / 10));
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col items-center flex-1 relative overflow-hidden group hover:border-emerald-200 transition-all">
      {/* Battery Picture Header Bar */}
      <div className="w-full flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl overflow-hidden border border-gray-200 shadow-2xs bg-gray-50 flex items-center justify-center p-0.5 flex-shrink-0">
            <EvBatteryThumbnail
              soc={clamped}
              isDeparture={isDeparture}
              alt="Dynamic Battery Vector"
            />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-800 tracking-wide uppercase">
              {title}
            </h4>
            <span className="text-[10px] text-gray-400 font-medium block">
              {(360 * (clamped / 100)).toFixed(1)} kWh / 360 kWh
            </span>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
            isDeparture
              ? 'bg-emerald-50 text-[#1A6B52] border-emerald-200'
              : clamped < 20
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-amber-50 text-[#9A6517] border-amber-200'
          }`}
        >
          {isDeparture && <Zap className="w-2.5 h-2.5 text-[#1A6B52] fill-current animate-pulse" />}
          {isDeparture ? 'Fast Charged' : clamped < 20 ? 'Critical' : 'Arrival'}
        </span>
      </div>

      {/* Donut Chart with Centered Metric */}
      <div className="relative flex items-center justify-center my-1" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90 drop-shadow-2xs">
          {/* Background Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E9EFEA"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-[#183129] tracking-tight">
            {clamped.toFixed(1)}%
          </span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {subtitle}
          </span>
        </div>
      </div>

      {/* Horizontal Dynamic Battery Level Bar with Cell Details */}
      <div className="w-full mt-3 pt-3 border-t border-gray-100 flex flex-col items-center gap-1.5">
        <BatteryVisual
          soc={clamped}
          size="sm"
          orientation="horizontal"
          isCharging={isDeparture}
          showPercentageText={false}
          className="w-full justify-center"
        />
        <div className="w-full flex justify-between text-[9px] text-gray-400 font-semibold px-2">
          <span>0% EMPTY</span>
          <span className="text-gray-500 font-bold">{clamped.toFixed(1)}% SOC</span>
          <span>100% FULL</span>
        </div>
      </div>
    </div>
  );
};
