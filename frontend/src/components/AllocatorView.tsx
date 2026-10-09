import React, { useState, useEffect } from 'react';
import { ChargeSession, AllocationResult } from '../types';
import {
  allocate,
  parseTimeToMinutes,
  formatTime24,
  formatTime12,
  getChargerSnapshotsAtTime,
} from '../engine/chargingAllocationEngine';
import { SocDonutChart } from './SocDonutChart';
import { ChargerStatusGrid } from './ChargerStatusGrid';
import { BatteryVisual, BatteryCardPicture, EvBatteryThumbnail, EvChargerThumbnail, EvBusThumbnail, VectorBatteryChargePic } from './BatteryVisual';
import { Zap, Bus, Clock, Battery, Play, RotateCcw, Sparkles, CheckCircle2, AlertTriangle, PlusCircle } from 'lucide-react';

interface AllocatorViewProps {
  sessions: ChargeSession[];
  onAddSession: (session: ChargeSession) => void;
}

export const AllocatorView: React.FC<AllocatorViewProps> = ({ sessions, onAddSession }) => {
  const [busNumberInput, setBusNumberInput] = useState<string>('4');
  const [arrivalTimeInput, setArrivalTimeInput] = useState<string>('20:00');
  const [arrivalSocInput, setArrivalSocInput] = useState<string>('20');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AllocationResult | null>(null);
  const [addedSuccess, setAddedSuccess] = useState<boolean>(false);

  // Animated "Charging..." ticker matching VBA ShowChargingUI
  const [dotIndex, setDotIndex] = useState<number>(0);
  useEffect(() => {
    if (result?.allocatedCharger) {
      const interval = setInterval(() => {
        setDotIndex(prev => (prev + 1) % 4);
      }, 700);
      return () => clearInterval(interval);
    }
  }, [result]);

  const chargingAnimationText = ['Charging', 'Charging.', 'Charging..', 'Charging...'][dotIndex];

  // Run initial allocation on mount
  useEffect(() => {
    const initialResult = allocate(
      { busNumber: 4, arrivalTime: '20:00', arrivalSoc: 20 },
      sessions
    );
    setResult(initialResult);
  }, [sessions]);

  const handleAllocate = () => {
    const busNum = parseInt(busNumberInput, 10);
    if (!busNum || busNum <= 0) {
      setErrorMessage('Enter Bus Number');
      return;
    }
    const minute = parseTimeToMinutes(arrivalTimeInput);
    if (minute === null) {
      setErrorMessage('Enter valid arrival time (hh:mm)');
      return;
    }
    const soc = parseFloat(arrivalSocInput);
    if (isNaN(soc) || soc < 20 || soc > 100) {
      setErrorMessage('Enter valid arrival SOC (20 to 100%)');
      return;
    }

    setErrorMessage(null);
    setAddedSuccess(false);
    const res = allocate({ busNumber: busNum, arrivalTime: arrivalTimeInput, arrivalSoc: soc }, sessions);
    setResult(res);
  };

  const handleReset = () => {
    setBusNumberInput('');
    setArrivalTimeInput('');
    setArrivalSocInput('20');
    setErrorMessage(null);
    setResult(null);
    setAddedSuccess(false);
  };

  const handleLoadSample = () => {
    setBusNumberInput('4');
    setArrivalTimeInput('20:00');
    setArrivalSocInput('20');
    setErrorMessage(null);
    setAddedSuccess(false);
    const res = allocate({ busNumber: 4, arrivalTime: '20:00', arrivalSoc: 20 }, sessions);
    setResult(res);
  };

  const handleCommitSession = () => {
    if (result && result.allocatedCharger && result.pluginMinute !== null && result.plugoutMinute !== null) {
      const newSession: ChargeSession = {
        id: `alloc-${Date.now().toString().slice(-6)}`,
        bus: result.busNumber,
        charger: result.allocatedCharger,
        startMinute: result.pluginMinute,
        endMinute: result.plugoutMinute,
        durationMinutes: result.plugoutMinute - result.pluginMinute,
      };
      onAddSession(newSession);
      setAddedSuccess(true);
    }
  };

  const evaluatedMinute = parseTimeToMinutes(arrivalTimeInput) ?? 1200;
  const snapshots = getChargerSnapshotsAtTime(evaluatedMinute, sessions);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#123D30] to-[#1A6B52] rounded-3xl p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-[11px] font-bold tracking-wider uppercase mb-2">
              <Zap className="w-3.5 h-3.5 text-emerald-300" />
              Depot Operations · Dispatch
            </div>
            <h2 className="text-2xl font-bold">Electric Bus Charger Allocation</h2>
            <p className="text-emerald-100 text-sm mt-1">
              Automated charger assignment, plug-in/plug-out schedule & 240kW fast charge SOC estimation
            </p>
          </div>
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-2 bg-emerald-400/20 hover:bg-emerald-400/30 text-white border border-emerald-300/40 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all"
          >
            <Sparkles className="w-4 h-4 text-emerald-300" />
            Load Sample (Bus 4 @ 20:00)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & Allocation Results */}
        <div className="lg:col-span-7 space-y-6">
          {/* Inputs Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-900 text-base mb-1">
              Vehicle & Arrival Parameters
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              Enter EB number, arrival time (24-hour format), and current battery SOC%
            </p>

            <div className="space-y-4">
              {/* Bus Number */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Electric Bus Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-emerald-200 bg-white shadow-2xs">
                      <EvBusThumbnail className="w-full h-full object-cover" alt="Switch EiV12" />
                    </div>
                  </div>
                  <input
                    type="number"
                    value={busNumberInput}
                    onChange={e => {
                      setBusNumberInput(e.target.value);
                      setErrorMessage(null);
                      setAddedSuccess(false);
                    }}
                    placeholder="e.g. 4"
                    className="w-full pl-[4.5rem] pr-4 py-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1A6B52] focus:border-transparent text-sm font-semibold text-gray-800"
                  />
                </div>
              </div>

              {/* Arrival Time */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Electric Bus Arrival Time (HH:mm)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Clock className="w-4 h-4 text-[#1A6B52]" />
                  </div>
                  <input
                    type="text"
                    value={arrivalTimeInput}
                    onChange={e => {
                      setArrivalTimeInput(e.target.value);
                      setErrorMessage(null);
                      setAddedSuccess(false);
                    }}
                    placeholder="e.g. 20:00 or 8:00 PM"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1A6B52] focus:border-transparent text-sm font-semibold text-gray-800"
                  />
                </div>
                {/* Time suggestions */}
                <div className="flex gap-2 mt-2">
                  {['13:00', '20:00', '21:30', '22:05'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setArrivalTimeInput(t);
                        setErrorMessage(null);
                        setAddedSuccess(false);
                      }}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                        arrivalTimeInput === t
                          ? 'bg-[#E4F3EA] text-[#1A6B52] border-[#1A6B52]'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arrival SOC */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Electric Bus SOC Level (%)
                  </label>
                  {/* Dynamic Battery Visual Preview */}
                  <BatteryVisual
                    soc={parseFloat(arrivalSocInput) || 0}
                    size="sm"
                    showPercentageText
                  />
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Battery className="w-4 h-4 text-[#1A6B52]" />
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="20"
                    max="100"
                    value={arrivalSocInput}
                    onChange={e => {
                      setArrivalSocInput(e.target.value);
                      setErrorMessage(null);
                      setAddedSuccess(false);
                    }}
                    placeholder="e.g. 20"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1A6B52] focus:border-transparent text-sm font-semibold text-gray-800"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400 font-bold text-xs">
                    %
                  </div>
                </div>

                {/* SOC Quick Selection Presets */}
                <div className="flex items-center gap-2 mt-2">
                  {['20', '35', '50'].map(socPreset => (
                    <button
                      key={socPreset}
                      type="button"
                      onClick={() => {
                        setArrivalSocInput(socPreset);
                        setErrorMessage(null);
                        setAddedSuccess(false);
                      }}
                      className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                        arrivalSocInput === socPreset
                          ? 'bg-[#E4F3EA] text-[#1A6B52] border-[#1A6B52]'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <BatteryVisual soc={parseFloat(socPreset)} size="xs" />
                      {socPreset}%
                    </button>
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {errorMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAllocate}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#1A6B52] hover:bg-[#145541] text-white font-bold py-3 px-5 rounded-xl shadow-md transition-all text-sm"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Allocate
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-all text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Allocation Results Output Box */}
          {result && (
            <div
              className={`rounded-2xl p-6 border shadow-sm transition-all ${
                result.isMissedAndReallocated
                  ? 'bg-[#FFF9EC] border-[#F2D696]'
                  : 'bg-[#F2FAF5] border-[#C5E5D3]'
              }`}
            >
              {/* Status Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-black/5">
                <div className="flex items-center gap-2.5">
                  {result.isMissedAndReallocated ? (
                    <AlertTriangle className="w-5 h-5 text-[#9A6517] flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-[#1A6B52] flex-shrink-0" />
                  )}
                  <span
                    className={`font-bold text-sm ${
                      result.isMissedAndReallocated ? 'text-[#9A6517]' : 'text-[#1A6B52]'
                    }`}
                  >
                    {result.statusText}
                  </span>
                </div>
                {result.allocatedCharger && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white rounded-full text-xs font-bold text-[#1A6B52] border border-emerald-200 shadow-sm">
                    <Zap className="w-3 h-3 text-[#1A6B52] animate-pulse" />
                    {chargingAnimationText}
                  </span>
                )}
              </div>

              {/* 4 Output Metrics Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="bg-white rounded-xl p-3.5 border border-black/5 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                      Allocated Charger
                    </span>
                    <div className="w-6 h-6 rounded-md overflow-hidden bg-emerald-50 border border-emerald-200 p-0.5">
                      <EvChargerThumbnail className="w-full h-full object-contain" />
                    </div>
                  </div>
                  <span className="text-xl font-extrabold text-[#1A6B52] block">
                    {result.allocatedCharger
                      ? `Charger ${result.allocatedCharger.toString().padStart(2, '0')}`
                      : 'None'}
                  </span>
                  <span className="text-[10px] font-medium text-gray-400 block mt-0.5">
                    {result.isMissedAndReallocated ? 'Reallocated' : 'Scheduled'}
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3.5 border border-black/5 shadow-2xs">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Plug-in Time
                  </span>
                  <span className="text-lg font-extrabold text-gray-900 block">
                    {result.pluginMinute !== null ? formatTime24(result.pluginMinute) : '--:--'}
                  </span>
                  <span className="text-[10px] font-medium text-gray-400 block mt-0.5">
                    {result.pluginMinute !== null ? formatTime12(result.pluginMinute) : ''}
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3.5 border border-black/5 shadow-2xs">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Plug-out Time
                  </span>
                  <span className="text-lg font-extrabold text-gray-900 block">
                    {result.plugoutMinute !== null ? formatTime24(result.plugoutMinute) : '--:--'}
                  </span>
                  <span className="text-[10px] font-medium text-gray-400 block mt-0.5">
                    {result.plugoutMinute !== null ? formatTime12(result.plugoutMinute) : ''}
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3.5 border border-black/5 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                      Expected SOC
                    </span>
                    {result.expectedSoc !== null && (
                      <BatteryVisual soc={result.expectedSoc} size="xs" isCharging />
                    )}
                  </div>
                  <span className="text-lg font-extrabold text-[#1A6B52] block">
                    {result.expectedSoc !== null ? `${result.expectedSoc.toFixed(2)}%` : '--'}
                  </span>
                  <span className="text-[10px] font-medium text-emerald-600 block mt-0.5">
                    {result.expectedSoc !== null
                      ? `+${(result.expectedSoc - result.arrivalSoc).toFixed(2)}% gain`
                      : ''}
                  </span>
                </div>
              </div>

              {/* Commit Button */}
              {result.allocatedCharger && !addedSuccess && (
                <button
                  onClick={handleCommitSession}
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-50 border border-gray-200 text-[#183129] font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all"
                >
                  <PlusCircle className="w-4 h-4 text-[#1A6B52]" />
                  Add This Assigned Session to Depot Plan
                </button>
              )}

              {addedSuccess && (
                <div className="mt-4 flex items-center justify-center gap-2 py-2 px-4 bg-emerald-100/70 border border-emerald-300 text-[#123D30] font-bold text-xs rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Successfully recorded into depot schedule!
                </div>
              )}
            </div>
          )}

          {/* SOC Doughnut Charts Matching VBA UserForm with High-Resolution Battery Picture Visuals */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center p-1.5 rounded-xl border border-emerald-300/40 shadow-xs bg-emerald-50 flex-shrink-0">
                    <VectorBatteryChargePic soc={result.expectedSoc ?? result.arrivalSoc} size="xs" isCharging />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      Battery State of Charge (SOC)
                    </h3>
                    <p className="text-xs text-gray-500">
                      Energy added via 240 kW DC fast chargers (95% efficiency, 360 kWh pack)
                    </p>
                  </div>
                </div>
              </div>

              {/* Gauge & 3D Battery Module Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <BatteryCardPicture
                  title="Arrival State"
                  subtitle="Initial Bus Battery"
                  soc={result.arrivalSoc}
                  isDeparture={false}
                />
                <BatteryCardPicture
                  title="Departure State"
                  subtitle="Post-Fast Charge Target"
                  soc={result.expectedSoc ?? result.arrivalSoc}
                  isDeparture={true}
                  gain={result.expectedSoc !== null ? result.expectedSoc - result.arrivalSoc : null}
                />
              </div>

              {/* Donut Gauges */}
              <div className="flex flex-col sm:flex-row gap-4">
                <SocDonutChart
                  title="SOC @ Arr. Time"
                  socValue={result.arrivalSoc}
                  color="#9A6517"
                  isDeparture={false}
                />
                <SocDonutChart
                  title="SOC @ Dep. Time"
                  socValue={result.expectedSoc ?? result.arrivalSoc}
                  color="#1A6B52"
                  isDeparture={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: 20-Charger Status Grid */}
        <div className="lg:col-span-5">
          <ChargerStatusGrid
            minuteOfDay={evaluatedMinute}
            snapshots={snapshots}
            allocatedChargerNumber={result?.allocatedCharger ?? null}
          />
        </div>
      </div>
    </div>
  );
};
