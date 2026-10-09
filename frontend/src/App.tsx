import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import type { DynamicScheduleResult, GamsBusRow } from './engine/dynamicSchedule';
import { buildDynamicSchedule } from './engine/dynamicSchedule';
import { parseGamsInclude, parseScheduleFile } from './engine/workbookImport';
import type { ChargeSession } from './types';
import { Header } from './components/Header';
import { AllocatorView } from './components/AllocatorView';
import { ChargersView } from './components/ChargersView';
import { OverviewView } from './components/OverviewView';
import { ScheduleView } from './components/ScheduleView';

type Tab = 'allocate' | 'overview' | 'schedule' | 'chargers';

const DEFAULT_INCLUDE = '/data/roh-gams-bus-table.inc';

async function loadDefaultSchedule(): Promise<GamsBusRow[]> {
  const response = await fetch(DEFAULT_INCLUDE);
  if (!response.ok) {
    throw new Error(`Could not load the bundled Roh.inc input (HTTP ${response.status}).`);
  }
  return parseGamsInclude(await response.text());
}

export const App: React.FC = () => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [currentTab, setCurrentTab] = useState<Tab>('overview');
  const [buses, setBuses] = useState<GamsBusRow[] | null>(null);
  const [sourceName, setSourceName] = useState('Bundled Roh.inc · GAMS Bus table');
  const [manualSessions, setManualSessions] = useState<ChargeSession[]>([]);
  const [deletedSessionIds, setDeletedSessionIds] = useState<Set<string>>(new Set());
  const [calculation, setCalculation] = useState<DynamicScheduleResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    loadDefaultSchedule()
      .then(setBuses)
      .catch(error => {
        setErrorMessage(error instanceof Error ? error.message : 'Could not read the bundled Roh.inc input.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!buses) {
      setCalculation(null);
      return;
    }

    let isCurrent = true;
    const controller = new AbortController();
    setIsOptimizing(true);
    void buildDynamicSchedule(buses, controller.signal)
      .then(result => {
        if (isCurrent) setCalculation(result);
      })
      .catch(error => {
        if (isCurrent && !(error instanceof DOMException && error.name === 'AbortError')) {
          setCalculation(null);
          setErrorMessage(error instanceof Error ? error.message : 'Could not optimize the charging schedule.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsOptimizing(false);
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [buses]);

  const sessions = useMemo(
    () => [
      ...(calculation?.sessions.filter(session => !deletedSessionIds.has(session.id)) ?? []),
      ...manualSessions,
    ],
    [calculation, deletedSessionIds, manualSessions],
  );

  const tripCount = useMemo(
    () =>
      buses?.reduce(
        (count, bus) =>
          count + Number(bus.distance1 > 0) + Number(bus.distance2 > 0),
        0,
      ) ?? 0,
    [buses],
  );

  const handleScheduleUpload = async (file: File | undefined) => {
    if (!file) return;
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const importedBuses = await parseScheduleFile(file);
      setBuses(importedBuses);
      setSourceName(
        file.name.toLowerCase().endsWith('.inc')
          ? `${file.name} · GAMS Bus table`
          : `${file.name} · Sheet3`,
      );
      setManualSessions([]);
      setDeletedSessionIds(new Set());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not import the workbook.');
    } finally {
      setIsLoading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleResetWorkbook = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      setBuses(await loadDefaultSchedule());
      setSourceName('Bundled Roh.inc · GAMS Bus table');
      setManualSessions([]);
      setDeletedSessionIds(new Set());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not reload bundled Roh.inc.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSession = (session: ChargeSession) => {
    setManualSessions(previous => [session, ...previous]);
    setDeletedSessionIds(previous => {
      const next = new Set(previous);
      next.delete(session.id);
      return next;
    });
  };

  const handleDeleteSession = (id: string) => {
    setManualSessions(previous => previous.filter(session => session.id !== id));
    setDeletedSessionIds(previous => new Set(previous).add(id));
  };

  return (
    <div className="min-h-screen bg-[#F5F7F4] flex flex-col font-sans">
      <Header
        currentTab={currentTab}
        onTabChange={tab => {
          if (tab === 'allocate' || tab === 'overview' || tab === 'schedule' || tab === 'chargers') {
            setCurrentTab(tab);
          }
        }}
        sessionCount={sessions.length}
      />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 space-y-5">
        <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#E4F3EA] text-[#1A6B52]">
                <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <h1 className="font-bold text-gray-900">Dynamic fleet schedule</h1>
                <p className="mt-0.5 text-xs text-gray-500">
                  Source: {sourceName}
                  {buses && ` · ${buses.length} buses · ${tripCount} trips`}
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
                  The schedule is solved from the imported bus data using the same model equations
                  and objective as Rohini2.gms. No preassigned charger schedule is used.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.inc"
                className="hidden"
                onChange={event => void handleScheduleUpload(event.target.files?.[0])}
                aria-label="Upload schedule data"
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={isLoading || isOptimizing}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1A6B52] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#145541] disabled:cursor-wait disabled:opacity-60"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import schedule data
              </button>
              <button
                type="button"
                onClick={() => void handleResetWorkbook()}
                disabled={isLoading || isOptimizing}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reload bundled input
              </button>
            </div>
          </div>

          {(isLoading || isOptimizing) && (
            <p className="mt-4 text-xs font-medium text-gray-500" role="status">
              {isLoading
                ? 'Reading schedule data…'
                : 'Solving the Rohini2.gms model with SCIP…'}
            </p>
          )}
          {errorMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}
          {calculation?.optimizationStatus === 'feasible_time_limit' && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
              A feasible schedule was found, but SCIP reached its time limit before proving it
              has the lowest possible cost.
              {calculation.mipGap !== null &&
                ` The remaining MIP gap is ${(calculation.mipGap * 100).toFixed(2)}%.`}
            </div>
          )}
          {calculation && calculation.warnings.length > 0 && (
            <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <summary className="cursor-pointer font-bold">
                {calculation.warnings.length} schedule or SOC validation warning(s)
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {calculation.warnings.slice(0, 12).map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
                {calculation.warnings.length > 12 && (
                  <li>And {calculation.warnings.length - 12} more warnings.</li>
                )}
              </ul>
            </details>
          )}
          {calculation && (
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              {calculation.optimizationStatus === 'optimal'
                ? 'Optimal schedule proven'
                : 'Feasible schedule; optimality not proven'}
              {' by the local SCIP backend using the Rohini2.gms mixed-integer model: 101 buses, '}
              288 five-minute time slots, 16 simultaneous chargers, GAMS tariff bands, and the
              original SOC and charging-duration equations.
            </p>
          )}
        </section>

        {calculation && (
          <>
            {currentTab === 'allocate' && (
              <AllocatorView sessions={sessions} onAddSession={handleAddSession} />
            )}
            {currentTab === 'overview' && (
              <OverviewView
                sessions={sessions}
                onGoToAllocate={() => setCurrentTab('allocate')}
                onGoToSchedule={() => setCurrentTab('schedule')}
              />
            )}
            {currentTab === 'schedule' && (
              <ScheduleView
                sessions={sessions}
                onDeleteSession={handleDeleteSession}
                onAddSession={handleAddSession}
              />
            )}
            {currentTab === 'chargers' && <ChargersView sessions={sessions} />}
          </>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500">
        <p>EB Scheduling Dynamic · Workbook-driven fleet charging plan</p>
      </footer>
    </div>
  );
};

export default App;
