import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, X } from 'lucide-react';
import { EquationPrompt, EquationRecord, SessionConfig } from '../types';
import { generateEquation } from '../utils/mathEngine';
import { recognizeCanvasDigits } from '../utils/ocr';
import {
  formatEquationForSpeech,
  speakText,
  stopSpeech,
} from '../utils/speech';

interface SessionViewProps {
  config: SessionConfig;
  onQuit: () => void;
  onComplete: (records: EquationRecord[]) => void;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const SessionView: React.FC<SessionViewProps> = ({
  config,
  onQuit,
  onComplete,
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState(
    config.durationSeconds
  );
  const [isDone, setIsDone] = useState(false);
  const [prompt, setPrompt] = useState<EquationPrompt>(() =>
    generateEquation(config.mode, config.maxDigit)
  );
  const [textAnswer, setTextAnswer] = useState('');
  const [isRecognizing, setIsRecognizing] = useState(false);

  const recordsRef = useRef<EquationRecord[]>([]);
  const promptRef = useRef<EquationPrompt>(prompt);
  const startTimeRef = useRef<number | null>(null);
  const isDoneRef = useRef(false);
  const isSubmittingOcrRef = useRef(false);
  const hasInkRef = useRef(false);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const midPointRef = useRef<{ x: number; y: number } | null>(null);

  const ocrDebounceRef = useRef<number | null>(null);
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  const clearDebounceTimer = useCallback(() => {
    if (ocrDebounceRef.current !== null) {
      window.clearTimeout(ocrDebounceRef.current);
      ocrDebounceRef.current = null;
    }
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hasInkRef.current = false;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    midPointRef.current = null;
  }, []);

  // Size canvas cleanly to its wrapper dimensions
  useEffect(() => {
    if (!config.audioEnabled) return;
    const wrapper = canvasWrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        clearCanvas();
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [config.audioEnabled, clearCanvas]);

  // Countdown timer
  useEffect(() => {
    const startWall = performance.now();
    const totalMs = config.durationSeconds * 1000;

    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startWall;
      const left = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
      setRemainingSeconds(left);

      if (left <= 0) {
        window.clearInterval(interval);
        isDoneRef.current = true;
        setIsDone(true);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [config.durationSeconds]);

  // Handle end-of-session "DONE" screen + audio + 1.2s pause
  useEffect(() => {
    if (!isDone) return;

    clearDebounceTimer();
    cancelSpeechRef.current?.();
    cancelSpeechRef.current = null;
    stopSpeech();

    if (config.audioEnabled) {
      speakText('Done', config.voiceGender, config.speechRate);
    }

    const doneTimer = window.setTimeout(() => {
      stopSpeech();
      onComplete(recordsRef.current);
    }, 1200);

    return () => {
      window.clearTimeout(doneTimer);
    };
  }, [
    isDone,
    config.audioEnabled,
    config.voiceGender,
    config.speechRate,
    clearDebounceTimer,
    onComplete,
  ]);

  // Trigger prompt timing and speech whenever a new prompt renders
  useEffect(() => {
    if (isDone) return;

    if (!config.audioEnabled) {
      startTimeRef.current = performance.now();
      inputRef.current?.focus();
      return;
    }

    // Audio + Handwriting mode: start timer when speech finishes (or on first stroke)
    startTimeRef.current = null;
    clearCanvas();

    const spoken = formatEquationForSpeech(
      prompt.operand_a,
      prompt.operator,
      prompt.operand_b
    );

    cancelSpeechRef.current?.();
    cancelSpeechRef.current = speakText(
      spoken,
      config.voiceGender,
      config.speechRate,
      () => {
        if (!isDoneRef.current && startTimeRef.current === null) {
          startTimeRef.current = performance.now();
        }
      }
    );

    return () => {
      cancelSpeechRef.current?.();
      cancelSpeechRef.current = null;
    };
  }, [
    prompt,
    isDone,
    config.audioEnabled,
    config.voiceGender,
    config.speechRate,
    clearCanvas,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearDebounceTimer();
      cancelSpeechRef.current?.();
      stopSpeech();
    };
  }, [clearDebounceTimer]);

  const recordAndAdvance = useCallback(
    (userAnswerRaw: string, responseTimeMs: number) => {
      if (isDoneRef.current) return;

      const current = promptRef.current;
      const trimmed = userAnswerRaw.trim();
      const parsedNum = trimmed !== '' ? Number(trimmed) : NaN;
      const isCorrect =
        trimmed !== '' &&
        Number.isFinite(parsedNum) &&
        parsedNum === current.expected_answer;

      const record: EquationRecord = {
        timestamp_iso: new Date().toISOString(),
        mode: config.mode,
        max_digit: config.maxDigit,
        input_mode: config.audioEnabled ? 'audio' : 'visual',
        equation: current.equation,
        operand_a: current.operand_a,
        operator: current.operator,
        operand_b: current.operand_b,
        expected_answer: current.expected_answer,
        user_answer: trimmed,
        is_correct: isCorrect,
        response_time_ms: Math.max(1, Math.round(responseTimeMs)),
      };

      recordsRef.current = [...recordsRef.current, record];
      setTextAnswer('');
      setPrompt(
        generateEquation(config.mode, config.maxDigit, current.equation)
      );
    },
    [config.mode, config.maxDigit, config.audioEnabled]
  );

  const handleVisualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDoneRef.current) return;
    if (textAnswer.trim() === '') return;

    const now = performance.now();
    const start = startTimeRef.current ?? now;
    recordAndAdvance(textAnswer, now - start);
  };

  const scheduleOcrSubmit = useCallback(() => {
    clearDebounceTimer();
    if (!hasInkRef.current || isDoneRef.current || isSubmittingOcrRef.current) {
      return;
    }

    ocrDebounceRef.current = window.setTimeout(async () => {
      if (isDoneRef.current || !hasInkRef.current || !canvasRef.current) return;

      const submitMoment = performance.now();
      const start = startTimeRef.current ?? submitMoment;
      const adjustedMs = Math.max(
        50,
        submitMoment - start - config.handwritingDelayMs
      );

      isSubmittingOcrRef.current = true;
      setIsRecognizing(true);

      try {
        const recognized = await recognizeCanvasDigits(canvasRef.current);
        if (!isDoneRef.current) {
          clearCanvas();
          recordAndAdvance(recognized, adjustedMs);
        }
      } catch {
        if (!isDoneRef.current) {
          clearCanvas();
          recordAndAdvance('', adjustedMs);
        }
      } finally {
        isSubmittingOcrRef.current = false;
        setIsRecognizing(false);
      }
    }, config.handwritingDelayMs);
  }, [clearDebounceTimer, config.handwritingDelayMs, clearCanvas, recordAndAdvance]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDoneRef.current || isSubmittingOcrRef.current) return;
    e.preventDefault();
    clearDebounceTimer();

    // If user starts writing before speech finishes, cancel speech and start timer now
    if (startTimeRef.current === null) {
      cancelSpeechRef.current?.();
      cancelSpeechRef.current = null;
      stopSpeech();
      startTimeRef.current = performance.now();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture unsupported
    }

    const pt = getCanvasPoint(e);
    isDrawingRef.current = true;
    hasInkRef.current = true;
    lastPointRef.current = pt;
    midPointRef.current = pt;

    const strokeW = Math.max(12, Math.min(22, Math.round(canvas.height * 0.04)));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, strokeW / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || isDoneRef.current) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const last = lastPointRef.current;
    const prevMid = midPointRef.current;
    if (!canvas || !ctx || !last || !prevMid) return;

    const pt = getCanvasPoint(e);
    const mid = {
      x: (last.x + pt.x) / 2,
      y: (last.y + pt.y) / 2,
    };
    const strokeW = Math.max(12, Math.min(22, Math.round(canvas.height * 0.04)));

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = strokeW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.stroke();

    lastPointRef.current = pt;
    midPointRef.current = mid;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const last = lastPointRef.current;
    const prevMid = midPointRef.current;
    if (canvas && ctx && last && prevMid) {
      const strokeW = Math.max(12, Math.min(22, Math.round(canvas.height * 0.04)));
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prevMid.x, prevMid.y);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
    midPointRef.current = null;
    scheduleOcrSubmit();
  };

  const handleClearPad = () => {
    clearDebounceTimer();
    clearCanvas();
  };

  const handleQuit = () => {
    clearDebounceTimer();
    cancelSpeechRef.current?.();
    stopSpeech();
    onQuit();
  };

  if (isDone) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-white text-[#0F172A] select-none">
        <div className="text-center px-6">
          <p className="text-6xl sm:text-8xl font-bold tracking-tight text-slate-900">
            DONE
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-white text-[#0F172A] overflow-hidden">
      {/* Subtle Top Header */}
      <header className="h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between border-b border-slate-100">
        <span
          aria-live="off"
          className="text-lg font-mono-tabular font-medium text-slate-600"
        >
          {formatClock(remainingSeconds)}
        </span>

        <button
          type="button"
          onClick={handleQuit}
          className="min-h-[44px] min-w-[44px] px-3.5 rounded-lg inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>Quit</span>
        </button>
      </header>

      {/* Main Quiz Body */}
      {!config.audioEnabled ? (
        <main
          className="flex-1 flex flex-col items-center justify-center px-6 pb-12"
          onClick={() => inputRef.current?.focus()}
        >
          <div className="w-full max-w-2xl text-center space-y-10">
            <div className="text-5xl sm:text-7xl lg:text-8xl font-mono-tabular font-semibold tracking-tight text-slate-900 select-none">
              {prompt.equation}
            </div>

            <form
              onSubmit={handleVisualSubmit}
              className="flex flex-col items-center gap-4"
            >
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9-]*"
                enterKeyHint="done"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                aria-label="Answer"
                value={textAnswer}
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[^0-9-]/g, '');
                  setTextAnswer(filtered);
                }}
                className="w-56 sm:w-64 h-16 sm:h-20 text-center text-3xl sm:text-4xl font-mono-tabular font-semibold text-slate-900 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-[#0F172A] focus:bg-white transition-colors"
              />
              <button
                type="submit"
                className="sm:hidden min-h-[48px] px-8 rounded-xl bg-[#0F172A] text-white text-sm font-semibold active:scale-[0.98]"
              >
                Next
              </button>
              <p className="hidden sm:block text-xs text-slate-400">
                Press Enter to submit
              </p>
            </form>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Upper ~30% Equation Display */}
          <div className="h-[28%] min-h-[120px] shrink-0 flex flex-col items-center justify-center px-4 border-b border-slate-200 bg-[#F8FAFC] select-none">
            <div className="text-4xl sm:text-6xl font-mono-tabular font-semibold tracking-tight text-slate-900">
              {prompt.equation}
            </div>
            <p className="mt-2 text-xs text-slate-400 h-4">
              {isRecognizing
                ? 'Reading handwriting...'
                : 'Write answer below'}
            </p>
          </div>

          {/* Lower ~70% Edge-to-Edge Handwriting Canvas */}
          <div
            ref={canvasWrapperRef}
            className="relative flex-1 w-full bg-white overflow-hidden select-none"
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ touchAction: 'none' }}
              className="block w-full h-full cursor-crosshair bg-white"
              aria-label="Handwriting answer pad"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-[74%] border-t border-dashed border-slate-200 flex justify-center"
            >
              <span className="mt-2 text-[11px] text-slate-300">
                Write digits side-by-side
              </span>
            </div>

            <button
              type="button"
              onClick={handleClearPad}
              className="absolute bottom-5 right-5 min-h-[48px] min-w-[96px] px-5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 border border-slate-300 text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
            >
              <Eraser className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </div>
        </main>
      )}
    </div>
  );
};
