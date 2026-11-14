import React, { useMemo, useState } from 'react';
import { Download, Home, RotateCcw } from 'lucide-react';
import { CSV_HEADERS, EquationRecord } from '../types';
import { computeSummaryMetrics } from '../utils/mathEngine';
import { downloadCsvFile } from '../utils/csv';

interface EndSummaryViewProps {
  currentRunRecords: EquationRecord[];
  accumulatedRecords: EquationRecord[];
  onReplay: () => void;
  onMainMenu: () => void;
}

export const EndSummaryView: React.FC<EndSummaryViewProps> = ({
  currentRunRecords,
  accumulatedRecords,
  onReplay,
  onMainMenu,
}) => {
  const hasMultipleRuns =
    accumulatedRecords.length > currentRunRecords.length &&
    currentRunRecords.length > 0;

  const [scope, setScope] = useState<'run' | 'cumulative'>('run');

  const activeRecords =
    scope === 'cumulative' || currentRunRecords.length === 0
      ? accumulatedRecords
      : currentRunRecords;

  const metrics = useMemo(
    () => computeSummaryMetrics(activeRecords),
    [activeRecords]
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-20 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              Session Summary
            </span>
            <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap">
              {currentRunRecords.length} this run · {accumulatedRecords.length}{' '}
              cumulative
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onReplay}
              className="min-h-[40px] px-4 rounded-lg bg-[#0F172A] text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Replay Same Settings</span>
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="min-h-[40px] px-3.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Main Menu</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Scope Toggle if Replay accumulated multiple runs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Run Performance
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Zero-feedback drill completed. Review speed, accuracy, and full equation log below.
            </p>
          </div>

          {hasMultipleRuns && (
            <div className="inline-flex p-1 rounded-xl bg-slate-200/70 self-start">
              <button
                type="button"
                onClick={() => setScope('run')}
                className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  scope === 'run'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                This Run ({currentRunRecords.length})
              </button>
              <button
                type="button"
                onClick={() => setScope('cumulative')}
                className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  scope === 'cumulative'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cumulative ({accumulatedRecords.length})
              </button>
            </div>
          )}
        </div>

        {/* Key Metrics Grid */}
        {metrics.total === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
            <p className="text-base font-semibold text-slate-900">
              No equations were submitted during this run.
            </p>
            <p className="text-sm text-slate-500">
              Try replaying with the same settings or adjusting your timer duration.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
                <p className="text-xs font-medium text-slate-500">
                  Equations Attempted
                </p>
                <p className="text-3xl font-mono-tabular font-bold text-slate-900">
                  {currentRunRecords.length}
                </p>
                <p className="text-xs font-mono-tabular text-slate-500">
                  {accumulatedRecords.length} cumulative session
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
                <p className="text-xs font-medium text-slate-500">Accuracy</p>
                <p className="text-3xl font-mono-tabular font-bold text-slate-900">
                  {metrics.accuracyPct.toFixed(1)}%
                </p>
                <p className="text-xs font-mono-tabular text-slate-500">
                  {metrics.correctCount} / {metrics.total} correct
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
                <p className="text-xs font-medium text-slate-500">
                  Response Speed
                </p>
                <p className="text-3xl font-mono-tabular font-bold text-slate-900">
                  {metrics.avgTimeSec.toFixed(2)}s
                </p>
                <p className="text-xs font-mono-tabular text-slate-500">
                  Median {metrics.medianTimeSec.toFixed(2)}s
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
                <p className="text-xs font-medium text-slate-500">
                  Fastest / Slowest
                </p>
                <div className="space-y-1 pt-0.5">
                  <p className="text-sm font-mono-tabular font-semibold text-slate-900 truncate">
                    {(metrics.fastest!.response_time_ms / 1000).toFixed(2)}s ·{' '}
                    {metrics.fastest!.equation}
                  </p>
                  <p className="text-sm font-mono-tabular text-slate-600 truncate">
                    {(metrics.slowest!.response_time_ms / 1000).toFixed(2)}s ·{' '}
                    {metrics.slowest!.equation}
                  </p>
                </div>
              </div>
            </div>

            {/* Breakdown by Operation */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">
                  Breakdown by Operation
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-medium text-slate-500 bg-slate-50/60">
                      <th className="py-3 px-6">Operation</th>
                      <th className="py-3 px-6 text-right">Attempted</th>
                      <th className="py-3 px-6 text-right">Correct</th>
                      <th className="py-3 px-6 text-right">Accuracy</th>
                      <th className="py-3 px-6 text-right">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {metrics.byOperator.map((op) => (
                      <tr key={op.operator} className="hover:bg-slate-50/70">
                        <td className="py-3 px-6 font-medium text-slate-900">
                          {op.label}
                        </td>
                        <td className="py-3 px-6 text-right font-mono-tabular text-slate-700">
                          {op.count}
                        </td>
                        <td className="py-3 px-6 text-right font-mono-tabular text-slate-700">
                          {op.correctCount}
                        </td>
                        <td className="py-3 px-6 text-right font-mono-tabular font-semibold text-slate-900">
                          {op.accuracyPct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-6 text-right font-mono-tabular text-slate-700">
                          {op.avgTimeSec.toFixed(2)}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* CSV Preview & Download */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Session CSV Log ({accumulatedRecords.length} rows)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Includes all runs accumulated before returning to Main Menu
              </p>
            </div>
            <button
              type="button"
              disabled={accumulatedRecords.length === 0}
              onClick={() => downloadCsvFile(accumulatedRecords)}
              className="min-h-[44px] px-5 rounded-xl bg-[#0284C7] text-white text-sm font-semibold hover:bg-[#0369A1] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Download CSV</span>
            </button>
          </div>

          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-mono-tabular">
                <tr>
                  {CSV_HEADERS.map((header) => (
                    <th
                      key={header}
                      className="py-2.5 px-3.5 font-semibold whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-tabular">
                {accumulatedRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={CSV_HEADERS.length}
                      className="py-8 text-center text-slate-400 font-sans"
                    >
                      No equation records to preview.
                    </td>
                  </tr>
                ) : (
                  accumulatedRecords.map((row, idx) => (
                    <tr
                      key={`${row.timestamp_iso}-${idx}`}
                      className="hover:bg-slate-50/70"
                    >
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500">
                        {row.timestamp_iso}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                        {row.mode}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                        {row.max_digit}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                        {row.input_mode}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold text-slate-900">
                        {row.equation}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                        {row.operand_a}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                        {row.operator}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                        {row.operand_b}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-900">
                        {row.expected_answer}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-900">
                        {row.user_answer || '—'}
                      </td>
                      <td
                        className={`py-2.5 px-3.5 whitespace-nowrap font-semibold ${
                          row.is_correct ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {row.is_correct ? 'true' : 'false'}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                        {row.response_time_ms}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bottom Action Row for mobile ergonomics */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onMainMenu}
            className="min-h-[48px] px-6 rounded-xl bg-white border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
          <button
            type="button"
            onClick={onReplay}
            className="min-h-[48px] px-6 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Replay Same Settings</span>
          </button>
        </div>
      </main>
    </div>
  );
};
