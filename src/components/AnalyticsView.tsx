import React, { useEffect, useMemo, useRef } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  Plugin,
  PointElement,
  Tooltip,
} from 'chart.js';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import { OperatorSymbol, UploadedEquationRecord } from '../types';
import { computeSummaryMetrics, computeWeakSpots } from '../utils/mathEngine';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip
);

const whiteCanvasPlugin: Plugin = {
  id: 'customWhiteBackground',
  beforeDraw: (chart) => {
    const ctx = chart.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

interface AnalyticsViewProps {
  records: UploadedEquationRecord[];
  fileNames: string[];
  uploadError: string | null;
  onDismissError: () => void;
  onUploadFiles: (files: FileList) => void;
  onBackToMenu: () => void;
}

interface SessionPoint {
  label: string;
  avgTimeSec: number;
  accuracyPct: number;
  count: number;
}

interface DifficultyPoint {
  label: string;
  avgTimeSec: number;
  accuracyPct: number;
  count: number;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  records,
  fileNames,
  uploadError,
  onDismissError,
  onUploadFiles,
  onBackToMenu,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const progressionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const difficultyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const operationsCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const summary = useMemo(() => computeSummaryMetrics(records), [records]);
  const weakSpots = useMemo(() => computeWeakSpots(records), [records]);

  // Group records into chronological sessions (split by file or >60s timestamp gap)
  const sessionSeries = useMemo<SessionPoint[]>(() => {
    if (records.length === 0) return [];
    const sorted = [...records].sort(
      (a, b) =>
        Date.parse(a.timestamp_iso) - Date.parse(b.timestamp_iso) ||
        a.sourceFileIndex - b.sourceFileIndex
    );

    const groups: UploadedEquationRecord[][] = [];
    let current: UploadedEquationRecord[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gapMs =
        Date.parse(curr.timestamp_iso) - Date.parse(prev.timestamp_iso);
      if (curr.sourceFileIndex !== prev.sourceFileIndex || gapMs > 60_000) {
        groups.push(current);
        current = [curr];
      } else {
        current.push(curr);
      }
    }
    groups.push(current);

    return groups.map((group, idx) => {
      const firstDate = new Date(group[0].timestamp_iso);
      const formatted = firstDate.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const avgTimeSec =
        group.reduce((s, r) => s + r.response_time_ms, 0) /
        group.length /
        1000;
      const accuracyPct =
        (group.filter((r) => r.is_correct).length / group.length) * 100;
      return {
        label: groups.length > 1 ? `S${idx + 1} (${formatted})` : formatted,
        avgTimeSec: Number(avgTimeSec.toFixed(2)),
        accuracyPct: Number(accuracyPct.toFixed(1)),
        count: group.length,
      };
    });
  }, [records]);

  // Group by mode + max_digit + input_mode
  const difficultySeries = useMemo<DifficultyPoint[]>(() => {
    const map = new Map<string, UploadedEquationRecord[]>();
    for (const r of records) {
      const modeTag = r.mode === 'multiplication' ? '×' : 'All';
      const inputTag = r.input_mode === 'audio' ? 'Audio' : 'Visual';
      const key = `${modeTag} ≤${r.max_digit} (${inputTag})`;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }

    return Array.from(map.entries())
      .map(([label, list]) => ({
        label,
        avgTimeSec: Number(
          (
            list.reduce((s, r) => s + r.response_time_ms, 0) /
            list.length /
            1000
          ).toFixed(2)
        ),
        accuracyPct: Number(
          (
            (list.filter((r) => r.is_correct).length / list.length) *
            100
          ).toFixed(1)
        ),
        count: list.length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  // Operator breakdown
  const operatorSeries = useMemo(() => {
    const ops: OperatorSymbol[] = ['+', '-', '×', '÷'];
    return ops
      .map((op) => {
        const list = records.filter((r) => r.operator === op);
        if (list.length === 0) return null;
        return {
          label: op,
          avgTimeSec: Number(
            (
              list.reduce((s, r) => s + r.response_time_ms, 0) /
              list.length /
              1000
            ).toFixed(2)
          ),
          accuracyPct: Number(
            (
              (list.filter((r) => r.is_correct).length / list.length) *
              100
            ).toFixed(1)
          ),
          count: list.length,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [records]);

  // Chart 1: Performance Over Time
  useEffect(() => {
    const canvas = progressionCanvasRef.current;
    if (!canvas || sessionSeries.length === 0) return;

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: sessionSeries.map((s) => s.label),
        datasets: [
          {
            label: 'Avg Response Time (s)',
            data: sessionSeries.map((s) => s.avgTimeSec),
            borderColor: '#0284C7',
            backgroundColor: 'rgba(2, 132, 199, 0.12)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#0284C7',
            tension: 0.25,
            yAxisID: 'yTime',
          },
          {
            label: 'Accuracy (%)',
            data: sessionSeries.map((s) => s.accuracyPct),
            borderColor: '#0F172A',
            backgroundColor: 'rgba(15, 23, 42, 0.08)',
            borderWidth: 2.5,
            borderDash: [5, 4],
            pointRadius: 4,
            pointBackgroundColor: '#0F172A',
            tension: 0.25,
            yAxisID: 'yAcc',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              color: '#334155',
              font: { family: 'Plus Jakarta Sans, sans-serif', size: 12 },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748B', font: { size: 11 } },
          },
          yTime: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Response Time (s)',
              color: '#0284C7',
              font: { size: 11, weight: 'bold' },
            },
            ticks: { color: '#0284C7' },
            grid: { color: '#F1F5F9' },
          },
          yAcc: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            title: {
              display: true,
              text: 'Accuracy (%)',
              color: '#0F172A',
              font: { size: 11, weight: 'bold' },
            },
            ticks: { color: '#0F172A' },
            grid: { drawOnChartArea: false },
          },
        },
      },
      plugins: [whiteCanvasPlugin],
    };

    const chart = new Chart(canvas, config);
    return () => chart.destroy();
  }, [sessionSeries]);

  // Chart 2: Difficulty vs Speed & Accuracy
  useEffect(() => {
    const canvas = difficultyCanvasRef.current;
    if (!canvas || difficultySeries.length === 0) return;

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: difficultySeries.map((d) => d.label),
        datasets: [
          {
            label: 'Avg Response Time (s)',
            data: difficultySeries.map((d) => d.avgTimeSec),
            backgroundColor: '#0284C7',
            borderRadius: 6,
            yAxisID: 'yTime',
          },
          {
            label: 'Accuracy (%)',
            data: difficultySeries.map((d) => d.accuracyPct),
            backgroundColor: '#0F172A',
            borderRadius: 6,
            yAxisID: 'yAcc',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              color: '#334155',
              font: { family: 'Plus Jakarta Sans, sans-serif', size: 12 },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#475569', font: { size: 11 } },
          },
          yTime: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Response Time (s)',
              color: '#0284C7',
              font: { size: 11, weight: 'bold' },
            },
            ticks: { color: '#0284C7' },
            grid: { color: '#F1F5F9' },
          },
          yAcc: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            title: {
              display: true,
              text: 'Accuracy (%)',
              color: '#0F172A',
              font: { size: 11, weight: 'bold' },
            },
            ticks: { color: '#0F172A' },
            grid: { drawOnChartArea: false },
          },
        },
      },
      plugins: [whiteCanvasPlugin],
    };

    const chart = new Chart(canvas, config);
    return () => chart.destroy();
  }, [difficultySeries]);

  // Chart 3: Operation Breakdown
  useEffect(() => {
    const canvas = operationsCanvasRef.current;
    if (!canvas || operatorSeries.length === 0) return;

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: operatorSeries.map((o) => o.label),
        datasets: [
          {
            label: 'Accuracy (%)',
            data: operatorSeries.map((o) => o.accuracyPct),
            backgroundColor: '#059669',
            borderRadius: 6,
            yAxisID: 'yAcc',
          },
          {
            label: 'Avg Response Time (s)',
            data: operatorSeries.map((o) => o.avgTimeSec),
            backgroundColor: '#D97706',
            borderRadius: 6,
            yAxisID: 'yTime',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              color: '#334155',
              font: { family: 'Plus Jakarta Sans, sans-serif', size: 12 },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#0F172A', font: { size: 14, weight: 'bold' } },
          },
          yAcc: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            title: {
              display: true,
              text: 'Accuracy (%)',
              color: '#059669',
              font: { size: 11, weight: 'bold' },
            },
            ticks: { color: '#059669' },
            grid: { color: '#F1F5F9' },
          },
          yTime: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Response Time (s)',
              color: '#D97706',
              font: { size: 11, weight: 'bold' },
            },
            ticks: { color: '#D97706' },
            grid: { drawOnChartArea: false },
          },
        },
      },
      plugins: [whiteCanvasPlugin],
    };

    const chart = new Chart(canvas, config);
    return () => chart.destroy();
  }, [operatorSeries]);

  const handleSaveSingleChart = (
    canvas: HTMLCanvasElement | null,
    filename: string
  ) => {
    if (!canvas) return;
    downloadDataUrl(canvas.toDataURL('image/png'), filename);
  };

  const handleSaveFullReport = () => {
    const c1 = progressionCanvasRef.current;
    const c2 = difficultyCanvasRef.current;
    const c3 = operationsCanvasRef.current;
    if (!c1 || !c2 || !c3) return;

    const width = 1280;
    const padding = 48;
    const headerHeight = 140;
    const chartBoxW = (width - padding * 3) / 2;
    const chartBoxH = 340;
    const weaknessHeight = Math.max(180, 80 + weakSpots.length * 46);
    const totalHeight =
      headerHeight + chartBoxH * 2 + weaknessHeight + padding * 4;

    const reportCanvas = document.createElement('canvas');
    reportCanvas.width = width;
    reportCanvas.height = totalHeight;
    const ctx = reportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, totalHeight);

    // Header text
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Cadence — Comparative Mental Math Report', padding, 60);

    ctx.fillStyle = '#475569';
    ctx.font = '16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      `Files: ${fileNames.join(', ')}  ·  Total Equations: ${
        summary.total
      }  ·  Accuracy: ${summary.accuracyPct.toFixed(
        1
      )}%  ·  Avg Speed: ${summary.avgTimeSec.toFixed(
        2
      )}s  ·  Median: ${summary.medianTimeSec.toFixed(2)}s`,
      padding,
      96
    );

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, 120);
    ctx.lineTo(width - padding, 120);
    ctx.stroke();

    const drawChartPanel = (
      title: string,
      source: HTMLCanvasElement,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 17px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(title, x, y + 22);
      ctx.strokeStyle = '#E2E8F0';
      ctx.strokeRect(x, y + 34, w, h - 40);
      ctx.drawImage(source, x + 12, y + 44, w - 24, h - 60);
    };

    const row1Y = headerHeight + 10;
    drawChartPanel(
      '1. Performance Over Time',
      c1,
      padding,
      row1Y,
      chartBoxW,
      chartBoxH
    );
    drawChartPanel(
      '2. Difficulty vs. Speed & Accuracy',
      c2,
      padding * 2 + chartBoxW,
      row1Y,
      chartBoxW,
      chartBoxH
    );

    const row2Y = row1Y + chartBoxH + padding;
    drawChartPanel(
      '3. Operation Breakdown',
      c3,
      padding,
      row2Y,
      width - padding * 2,
      chartBoxH
    );

    // Weak spots section
    const row3Y = row2Y + chartBoxH + padding;
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Top Areas of Weakness', padding, row3Y + 24);

    weakSpots.forEach((spot, i) => {
      const sy = row3Y + 62 + i * 44;
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`• ${spot.title} (${spot.metricText})`, padding, sy);
      ctx.fillStyle = '#475569';
      ctx.font = '14px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(spot.detail, padding + 14, sy + 20);
    });

    downloadDataUrl(
      reportCanvas.toDataURL('image/png'),
      'math_analytics_report.png'
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-20 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToMenu}
            className="min-h-[44px] -ml-2 px-3 rounded-lg inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Main Menu</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
              className="min-h-[40px] px-3.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload CSVs</span>
            </button>
            <button
              type="button"
              onClick={handleSaveFullReport}
              className="min-h-[40px] px-4 rounded-lg bg-[#0F172A] text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Save Full Report Image</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onUploadFiles(e.target.files);
                }
              }}
              className="hidden"
              aria-label="Upload replacement CSV files"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {uploadError && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm leading-relaxed">
              <p className="font-semibold">Upload rejected</p>
              <p className="mt-0.5 text-red-800">{uploadError}</p>
            </div>
            <button
              type="button"
              onClick={onDismissError}
              className="min-h-[36px] px-2.5 text-xs font-medium text-red-700 hover:text-red-900 underline underline-offset-2 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Header Summary */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Comparative Analytics
          </h1>
          <p className="text-sm text-slate-600">
            Analyzing {records.length} equations across {fileNames.length}{' '}
            validated file{fileNames.length > 1 ? 's' : ''}:{' '}
            <span className="font-mono-tabular text-slate-500">
              {fileNames.join(' · ')}
            </span>
          </p>
        </div>

        {/* Aggregate KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">
              Total Equations
            </p>
            <p className="text-3xl font-mono-tabular font-bold text-slate-900">
              {summary.total}
            </p>
            <p className="text-xs font-mono-tabular text-slate-500">
              {sessionSeries.length} session{sessionSeries.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">
              Overall Accuracy
            </p>
            <p className="text-3xl font-mono-tabular font-bold text-slate-900">
              {summary.accuracyPct.toFixed(1)}%
            </p>
            <p className="text-xs font-mono-tabular text-slate-500">
              {summary.correctCount} correct
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">
              Average Latency
            </p>
            <p className="text-3xl font-mono-tabular font-bold text-slate-900">
              {summary.avgTimeSec.toFixed(2)}s
            </p>
            <p className="text-xs font-mono-tabular text-slate-500">
              Median {summary.medianTimeSec.toFixed(2)}s
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">
              Slowest Equation
            </p>
            <p className="text-2xl font-mono-tabular font-bold text-slate-900 truncate">
              {summary.slowest
                ? `${(summary.slowest.response_time_ms / 1000).toFixed(2)}s`
                : '—'}
            </p>
            <p className="text-xs font-mono-tabular text-slate-500 truncate">
              {summary.slowest ? summary.slowest.equation : '—'}
            </p>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-4">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-slate-900">
                Performance Over Time
              </h2>
              <p className="text-xs text-slate-500">
                Session progression comparing response latency (s) and accuracy (%)
              </p>
            </div>
            <div className="relative h-72 w-full">
              <canvas ref={progressionCanvasRef} />
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  handleSaveSingleChart(
                    progressionCanvasRef.current,
                    'chart_progression.png'
                  )
                }
                className="min-h-[40px] px-4 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Chart as PNG</span>
              </button>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-4">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-slate-900">
                Difficulty vs. Speed &amp; Accuracy
              </h2>
              <p className="text-xs text-slate-500">
                Comparison across mode, max digit ceiling, and visual vs. audio input
              </p>
            </div>
            <div className="relative h-72 w-full">
              <canvas ref={difficultyCanvasRef} />
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  handleSaveSingleChart(
                    difficultyCanvasRef.current,
                    'chart_difficulty.png'
                  )
                }
                className="min-h-[40px] px-4 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Chart as PNG</span>
              </button>
            </div>
          </section>
        </div>

        {/* Chart 3 + Weak-Spot Diagnostics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-4">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-slate-900">
                Operation Breakdown
              </h2>
              <p className="text-xs text-slate-500">
                Accuracy (%) and average latency (s) across +, −, ×, and ÷
              </p>
            </div>
            <div className="relative h-72 w-full flex-1">
              <canvas ref={operationsCanvasRef} />
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  handleSaveSingleChart(
                    operationsCanvasRef.current,
                    'chart_operations.png'
                  )
                }
                className="min-h-[40px] px-4 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Chart as PNG</span>
              </button>
            </div>
          </section>

          <section className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-base font-semibold text-slate-900">
                  Top Areas of Weakness
                </h2>
                <p className="text-xs text-slate-500">
                  Operators and operand ranges with lowest accuracy or highest latency
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {weakSpots.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500">
                    Upload additional equation rows to generate weak-spot diagnostics.
                  </p>
                ) : (
                  weakSpots.map((spot, idx) => (
                    <div key={idx} className="py-3.5 first:pt-1 last:pb-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {spot.title}
                        </h3>
                        <span
                          className={`text-xs font-mono-tabular font-semibold shrink-0 ${
                            spot.severity === 'accuracy'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {spot.metricText}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {spot.detail}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <span>All calculations executed locally</span>
              <span className="font-mono-tabular">100% client-side</span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
