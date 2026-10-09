import React from 'react';
import { Zap, Bus, PlugZap } from 'lucide-react';

export interface VectorBatteryChargePicProps {
  soc: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  orientation?: 'vertical' | 'horizontal';
  isCharging?: boolean;
  showPercentageText?: boolean;
  className?: string;
}

/**
 * Dynamic Vector Battery Illustration modeled after the Pinterest reference.
 * The fill level and color dynamically change based on SOC:
 * - < 20%: Red
 * - 20% - 49%: Amber / Orange
 * - >= 50%: Vivid Green (matching reference illustration)
 * Displays charging lightning bolt and live % readout.
 */
export const VectorBatteryChargePic: React.FC<VectorBatteryChargePicProps> = ({
  soc,
  size = 'md',
  orientation = 'vertical',
  isCharging = false,
  showPercentageText = true,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(soc * 10) / 10));

  // Determine dynamic color theme based on SOC %
  const getTheme = () => {
    if (clamped < 20) {
      return {
        gradId: 'redGrad',
        startColor: '#F87171',
        endColor: '#DC2626',
        glowColor: 'rgba(239, 68, 68, 0.45)',
        borderColor: '#B91C1C',
        textColor: '#B91C1C',
        bgCavity: '#1C1917',
      };
    }
    if (clamped < 50) {
      return {
        gradId: 'amberGrad',
        startColor: '#FBBF24',
        endColor: '#D97706',
        glowColor: 'rgba(245, 158, 11, 0.45)',
        borderColor: '#B45309',
        textColor: '#B45309',
        bgCavity: '#1C1917',
      };
    }
    return {
      gradId: 'greenGrad',
      startColor: '#34D399',
      endColor: '#059669',
      glowColor: 'rgba(16, 185, 129, 0.45)',
      borderColor: '#047857',
      textColor: '#047857',
      bgCavity: '#062017',
    };
  };

  const theme = getTheme();

  if (orientation === 'horizontal') {
    // Horizontal vector battery
    const dims = {
      xs: { w: 42, h: 20, bolt: 10, font: 9 },
      sm: { w: 60, h: 26, bolt: 12, font: 10 },
      md: { w: 90, h: 36, bolt: 16, font: 12 },
      lg: { w: 120, h: 48, bolt: 20, font: 14 },
      xl: { w: 160, h: 60, bolt: 24, font: 16 },
    }[size];

    const innerW = dims.w - 14;
    const innerH = dims.h - 8;
    const fillW = Math.max(3, (clamped / 100) * innerW);

    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <svg
          width={dims.w}
          height={dims.h}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          className="drop-shadow-xs overflow-visible"
        >
          <defs>
            <linearGradient id={`hGrad-${theme.gradId}-${clamped}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={theme.startColor} />
              <stop offset="100%" stopColor={theme.endColor} />
            </linearGradient>
            <filter id="hGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={theme.glowColor} />
            </filter>
          </defs>

          {/* Terminal node on the right */}
          <rect
            x={dims.w - 6}
            y={(dims.h - dims.h * 0.45) / 2}
            width={5}
            height={dims.h * 0.45}
            rx={2}
            fill="#475569"
            stroke="#1E293B"
            strokeWidth="1.5"
          />

          {/* Battery Outer Casing */}
          <rect
            x={1.5}
            y={1.5}
            width={dims.w - 8}
            height={dims.h - 3}
            rx={dims.h * 0.22}
            fill="#0F172A"
            stroke="#334155"
            strokeWidth="2.5"
          />

          {/* Inner cavity fill */}
          <rect
            x={4}
            y={4}
            width={innerW}
            height={innerH}
            rx={dims.h * 0.16}
            fill={theme.bgCavity}
          />

          {/* Dynamic Fill level */}
          <rect
            x={4}
            y={4}
            width={fillW}
            height={innerH}
            rx={dims.h * 0.16}
            fill={`url(#hGrad-${theme.gradId}-${clamped})`}
            filter="url(#hGlow)"
            className="transition-all duration-700 ease-out"
          />

          {/* Glass glare highlight */}
          <path
            d={`M 6 5 L ${dims.w - 12} 5 L ${dims.w - 14} ${dims.h * 0.35} L 8 ${dims.h * 0.35} Z`}
            fill="#FFFFFF"
            fillOpacity="0.2"
            pointerEvents="none"
          />

          {/* Lightning bolt centered */}
          <g transform={`translate(${(dims.w - 8) / 2 - dims.bolt / 2}, ${(dims.h - dims.bolt) / 2})`}>
            <polygon
              points={`${dims.bolt * 0.55},0 0,${dims.bolt * 0.55} ${dims.bolt * 0.45},${dims.bolt * 0.55} ${dims.bolt * 0.35},${dims.bolt} ${dims.bolt},${dims.bolt * 0.42} ${dims.bolt * 0.55},${dims.bolt * 0.42}`}
              fill="#FFFFFF"
              className={isCharging ? 'animate-pulse' : ''}
              style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.5))' }}
            />
          </g>
        </svg>

        {showPercentageText && (
          <span className="font-extrabold text-xs" style={{ color: theme.textColor }}>
            {clamped.toFixed(1)}%
          </span>
        )}
      </div>
    );
  }

  // Vertical Vector Battery Illustration (faithfully replicating the Pinterest vector)
  const dims = {
    xs: { w: 32, h: 54, capW: 14, capH: 4, bolt: 14, font: 9 },
    sm: { w: 46, h: 78, capW: 20, capH: 6, bolt: 18, font: 11 },
    md: { w: 68, h: 112, capW: 28, capH: 8, bolt: 26, font: 13 },
    lg: { w: 92, h: 152, capW: 36, capH: 10, bolt: 34, font: 17 },
    xl: { w: 120, h: 196, capW: 48, capH: 14, bolt: 44, font: 22 },
  }[size];

  const bodyW = dims.w;
  const bodyH = dims.h - dims.capH;
  const innerMargin = 4.5;
  const innerW = bodyW - innerMargin * 2;
  const innerH = bodyH - innerMargin * 2;
  const fillH = Math.max(5, (clamped / 100) * innerH);
  const fillY = dims.capH + innerMargin + (innerH - fillH);

  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      <svg
        width={dims.w}
        height={dims.h}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="overflow-visible drop-shadow-md"
      >
        <defs>
          {/* Vertical Dynamic Color Gradient */}
          <linearGradient id={`vGrad-${theme.gradId}-${clamped}`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={theme.endColor} />
            <stop offset="100%" stopColor={theme.startColor} />
          </linearGradient>

          {/* Metallic Top Cap Gradient */}
          <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#64748B" />
            <stop offset="50%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>

          {/* Outer Battery Border Gradient */}
          <linearGradient id="bodyBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>

          <filter id={`vGlow-${clamped}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={theme.glowColor} />
          </filter>
        </defs>

        {/* 1. Top Terminal Cap (Cathode) */}
        <rect
          x={(bodyW - dims.capW) / 2}
          y={1}
          width={dims.capW}
          height={dims.capH + 1}
          rx={dims.capH * 0.4}
          fill="url(#capGrad)"
          stroke="#1E293B"
          strokeWidth="1.5"
        />

        {/* 2. Main Battery Shell Casing */}
        <rect
          x={1.5}
          y={dims.capH}
          width={bodyW - 3}
          height={bodyH - 2}
          rx={bodyW * 0.24}
          fill="#0F172A"
          stroke="url(#bodyBorderGrad)"
          strokeWidth="3"
        />

        {/* 3. Interior Dark Cavity */}
        <rect
          x={innerMargin}
          y={dims.capH + innerMargin}
          width={innerW}
          height={innerH}
          rx={bodyW * 0.18}
          fill={theme.bgCavity}
        />

        {/* 4. Dynamic Energy Fill (Heights & Color change with SOC) */}
        <rect
          x={innerMargin}
          y={fillY}
          width={innerW}
          height={fillH}
          rx={bodyW * 0.18}
          fill={`url(#vGrad-${theme.gradId}-${clamped})`}
          filter={`url(#vGlow-${clamped})`}
          className="transition-all duration-700 ease-out"
        />

        {/* 5. Liquid surface meniscus highlight */}
        {fillH > 6 && (
          <line
            x1={innerMargin + 2}
            y1={fillY + 1}
            x2={innerMargin + innerW - 2}
            y2={fillY + 1}
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.75"
          />
        )}

        {/* 6. Vertical glossy reflection highlight on the glass */}
        <path
          d={`M ${innerMargin + 2} ${dims.capH + innerMargin + 2} Q ${innerMargin + innerW * 0.3} ${(dims.h) / 2} ${innerMargin + 2} ${dims.h - 8} Z`}
          fill="#FFFFFF"
          fillOpacity="0.18"
          pointerEvents="none"
        />

        {/* 7. Centered Bold Lightning Bolt Symbol (from reference) */}
        <g
          transform={`translate(${(bodyW - dims.bolt) / 2}, ${dims.capH + (bodyH - dims.bolt) / 2 - (showPercentageText && size !== 'xs' ? 8 : 0)})`}
        >
          <polygon
            points={`${dims.bolt * 0.58},0 0,${dims.bolt * 0.56} ${dims.bolt * 0.46},${dims.bolt * 0.56} ${dims.bolt * 0.36},${dims.bolt} ${dims.bolt},${dims.bolt * 0.44} ${dims.bolt * 0.56},${dims.bolt * 0.44}`}
            fill="#FFFFFF"
            className={isCharging ? 'animate-pulse' : ''}
            style={{
              filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.6))',
            }}
          />
        </g>

        {/* 8. Embedded Percentage Text (if requested) */}
        {showPercentageText && size !== 'xs' && (
          <text
            x={bodyW / 2}
            y={dims.capH + bodyH * 0.8}
            textAnchor="middle"
            fill="#FFFFFF"
            fontWeight="900"
            fontSize={dims.font}
            fontFamily="system-ui, -apple-system, sans-serif"
            style={{
              filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.85))',
            }}
          >
            {clamped.toFixed(0)}%
          </text>
        )}
      </svg>
    </div>
  );
};

// Aliased as BatteryVisual for complete backwards compatibility
export const BatteryVisual: React.FC<VectorBatteryChargePicProps> = (props) => {
  return <VectorBatteryChargePic {...props} />;
};

export interface EvChargerThumbnailProps {
  className?: string;
  alt?: string;
  invertWhite?: boolean;
}

export const EvChargerThumbnail: React.FC<EvChargerThumbnailProps> = ({
  className = '',
  alt = 'Car Charging Terminal Icon',
  invertWhite = false,
}) => {
  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    return <PlugZap className={className} aria-label={alt} />;
  }

  return (
    <img
      src="/images/charger_car_icon.webp"
      alt={alt}
      onError={() => setHasError(true)}
      referrerPolicy="no-referrer"
      className={`w-full h-full object-contain ${invertWhite ? 'brightness-0 invert' : ''} ${className}`}
    />
  );
};

export interface EvBusThumbnailProps {
  className?: string;
  alt?: string;
}

export const EvBusThumbnail: React.FC<EvBusThumbnailProps> = ({
  className = '',
  alt = 'Switch EiV12 Electric Bus',
}) => {
  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    return <Bus className={className} aria-label={alt} />;
  }

  return (
    <img
      src="/images/bus_switch_eiv12.webp"
      alt={alt}
      onError={() => setHasError(true)}
      referrerPolicy="no-referrer"
      className={`w-full h-full object-cover ${className}`}
    />
  );
};

// Thumbnail helper for battery vector illustration
export const EvBatteryThumbnail: React.FC<{
  soc?: number;
  isDeparture?: boolean;
  className?: string;
  alt?: string;
}> = ({ soc = 75, isDeparture = false, className = '' }) => {
  return (
    <VectorBatteryChargePic
      soc={soc}
      size="sm"
      orientation="vertical"
      isCharging={isDeparture}
      showPercentageText={false}
      className={className}
    />
  );
};

export interface BatteryCardPictureProps {
  title: string;
  soc: number;
  subtitle?: string;
  isDeparture?: boolean;
  gain?: number | null;
}

/**
 * Modern State of Charge Card that prominently features the requested vector battery illustration.
 * Fully dynamic: level and color (Red/Amber/Green) update cleanly based on the SOC value!
 */
export const BatteryCardPicture: React.FC<BatteryCardPictureProps> = ({
  title,
  soc,
  subtitle = 'State of Charge',
  isDeparture = false,
  gain = null,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(soc * 100) / 100));

  const isLow = clamped < 20;
  const isMed = clamped >= 20 && clamped < 50;

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between flex-1 relative overflow-hidden transition-all hover:shadow-md hover:border-emerald-200">
      {/* Decorative background glow */}
      <div
        className={`absolute -right-8 -bottom-8 w-44 h-44 rounded-full blur-3xl pointer-events-none ${
          isDeparture
            ? 'bg-emerald-100/70'
            : isLow
              ? 'bg-red-100/70'
              : 'bg-amber-100/70'
        }`}
      />

      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 mb-4 z-10">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
            {subtitle}
          </span>
          <h4 className="text-base font-extrabold text-gray-900">{title}</h4>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
            isDeparture
              ? 'bg-emerald-50 text-[#1A6B52] border-emerald-200'
              : isLow
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-amber-50 text-[#9A6517] border-amber-200'
          }`}
        >
          {isDeparture ? (
            <>
              <Zap className="w-3.5 h-3.5 text-[#1A6B52] fill-current animate-pulse" />
              Fast Charged
            </>
          ) : isLow ? (
            'Low Battery (<20%)'
          ) : (
            'Arrival State'
          )}
        </span>
      </div>

      {/* Main Interactive Battery Showcase using the Pinterest Vector Illustration */}
      <div className="py-2 flex items-center justify-between gap-6 z-10">
        {/* Dynamic Vector Battery Illustration (level and color dynamically change) */}
        <div className="flex items-center justify-center p-3 rounded-2xl bg-gradient-to-b from-gray-50 to-gray-100 border border-gray-200/80 shadow-xs flex-shrink-0">
          <VectorBatteryChargePic
            soc={clamped}
            size="lg"
            orientation="vertical"
            isCharging={isDeparture}
            showPercentageText={true}
          />
        </div>

        {/* SOC Details & Metric Readout */}
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-gray-900 tracking-tight">
                {clamped.toFixed(2)}
              </span>
              <span className="text-base font-bold text-gray-400">% SOC</span>
            </div>

            {gain !== null && gain > 0 && (
              <span className="inline-block mt-1 text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                +{gain.toFixed(2)}% fast charge gain
              </span>
            )}
          </div>

          {/* Horizontal Level Bar */}
          <div className="space-y-1">
            <VectorBatteryChargePic
              soc={clamped}
              size="md"
              orientation="horizontal"
              isCharging={isDeparture}
              showPercentageText={false}
              className="w-full"
            />
            <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold px-1">
              <span>0% Empty</span>
              <span>50%</span>
              <span>100% Full</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Capacity Info */}
      <div className="pt-3.5 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 z-10">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span
            className={`w-2 h-2 rounded-full ${
              clamped >= 50
                ? 'bg-emerald-500 shadow-[0_0_6px_#10B981]'
                : clamped >= 20
                  ? 'bg-amber-500 shadow-[0_0_6px_#F59E0B]'
                  : 'bg-red-500 shadow-[0_0_6px_#EF4444]'
            }`}
          />
          Battery Pack: {(360 * (clamped / 100)).toFixed(1)} / 360 kWh
        </span>
        <span className="font-bold text-gray-700">
          {clamped >= 80 ? 'Optimal Charge' : clamped >= 40 ? 'Adequate Range' : 'Needs Fast Charge'}
        </span>
      </div>
    </div>
  );
};
