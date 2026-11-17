import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2, Play, Volume2 } from 'lucide-react';
import { SessionConfig, TrainingMode, VoiceGender } from '../types';
import { initOcrWorker } from '../utils/ocr';
import { isSpeechSupported, unlockSpeechSynthesis } from '../utils/speech';

interface SettingsViewProps {
  config: SessionConfig;
  onUpdateConfig: (next: SessionConfig) => void;
  onBack: () => void;
  onStartSession: (finalConfig: SessionConfig) => void;
}

const TIMER_PRESETS = [30, 60, 120, 180];
const SPEECH_RATES = [0.75, 1.0, 1.25, 1.5];

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  onUpdateConfig,
  onBack,
  onStartSession,
}) => {
  const [maxDigitInput, setMaxDigitInput] = useState(String(config.maxDigit));
  const [durationInput, setDurationInput] = useState(
    String(config.durationSeconds)
  );
  const [isPreparingOcr, setIsPreparingOcr] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(true);

  useEffect(() => {
    setSpeechAvailable(isSpeechSupported());
    if (isSpeechSupported()) {
      // Trigger voice list hydration in Chrome/Safari
      window.speechSynthesis.getVoices();
    }
  }, []);

  const handleModeChange = (mode: TrainingMode) => {
    const nextDefaultDigit = mode === 'multiplication' ? 15 : 20;
    setMaxDigitInput(String(nextDefaultDigit));
    onUpdateConfig({
      ...config,
      mode,
      maxDigit: nextDefaultDigit,
    });
  };

  const handleMaxDigitBlur = () => {
    const parsed = parseInt(maxDigitInput, 10);
    const clamped = Number.isFinite(parsed)
      ? Math.max(1, Math.min(999, parsed))
      : config.mode === 'multiplication'
      ? 15
      : 20;
    setMaxDigitInput(String(clamped));
    onUpdateConfig({ ...config, maxDigit: clamped });
  };

  const handleDurationBlur = () => {
    const parsed = parseInt(durationInput, 10);
    const clamped = Number.isFinite(parsed)
      ? Math.max(10, Math.min(3600, parsed))
      : 60;
    setDurationInput(String(clamped));
    onUpdateConfig({ ...config, durationSeconds: clamped });
  };

  const handlePresetDuration = (sec: number) => {
    setDurationInput(String(sec));
    onUpdateConfig({ ...config, durationSeconds: sec });
  };

  const handleStartClick = async () => {
    setPrepError(null);

    const parsedDigit = parseInt(maxDigitInput, 10);
    const validMaxDigit = Number.isFinite(parsedDigit)
      ? Math.max(1, Math.min(999, parsedDigit))
      : config.mode === 'multiplication'
      ? 15
      : 20;

    const parsedDuration = parseInt(durationInput, 10);
    const validDuration = Number.isFinite(parsedDuration)
      ? Math.max(10, Math.min(3600, parsedDuration))
      : 60;

    const finalized: SessionConfig = {
      ...config,
      maxDigit: validMaxDigit,
      durationSeconds: validDuration,
    };
    onUpdateConfig(finalized);

    if (finalized.audioEnabled) {
      unlockSpeechSynthesis();
      setIsPreparingOcr(true);
      try {
        await initOcrWorker();
      } catch (err) {
        setIsPreparingOcr(false);
        setPrepError(
          err instanceof Error
            ? `Failed to initialize handwriting engine: ${err.message}`
            : 'Failed to initialize handwriting engine.'
        );
        return;
      }
      setIsPreparingOcr(false);
    }

    onStartSession(finalized);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-20 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            disabled={isPreparingOcr}
            className="min-h-[44px] min-w-[44px] -ml-2 px-3 rounded-lg inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <h1 className="text-base font-semibold text-slate-900 whitespace-nowrap">
            Session Settings
          </h1>
          <div className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mode & Operand Configuration */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">
                  Equation Mode
                </h2>
                <p className="text-xs text-slate-500">
                  Choose operation scope and maximum operand value
                </p>
              </div>

              <div
                role="radiogroup"
                aria-label="Training Mode"
                className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={config.mode === 'multiplication'}
                  onClick={() => handleModeChange('multiplication')}
                  className={`min-h-[56px] p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    config.mode === 'multiplication'
                      ? 'border-[#0F172A] bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-semibold">
                    Multiplication Only
                  </div>
                  <div
                    className={`text-xs mt-0.5 font-mono-tabular ${
                      config.mode === 'multiplication'
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    a × b
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={config.mode === 'all_symbols'}
                  onClick={() => handleModeChange('all_symbols')}
                  className={`min-h-[56px] p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    config.mode === 'all_symbols'
                      ? 'border-[#0F172A] bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-semibold">All Symbols</div>
                  <div
                    className={`text-xs mt-0.5 font-mono-tabular ${
                      config.mode === 'all_symbols'
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    + · − · × · ÷
                  </div>
                </button>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="max-digit-input"
                  className="block text-sm font-medium text-slate-800"
                >
                  Maximum Operand (maxDigit)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="max-digit-input"
                    type="number"
                    min={1}
                    max={999}
                    inputMode="numeric"
                    value={maxDigitInput}
                    onChange={(e) => {
                      setMaxDigitInput(e.target.value);
                      const v = parseInt(e.target.value, 10);
                      if (Number.isFinite(v) && v >= 1 && v <= 999) {
                        onUpdateConfig({ ...config, maxDigit: v });
                      }
                    }}
                    onBlur={handleMaxDigitBlur}
                    className="w-28 min-h-[44px] px-3.5 rounded-xl border border-slate-300 bg-white text-base font-mono-tabular font-semibold text-slate-900 focus:outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20"
                  />
                  <span className="text-xs text-slate-500 leading-snug">
                    {config.mode === 'multiplication'
                      ? 'Generates a × b where 1 ≤ a, b ≤ maxDigit (default 15).'
                      : 'Enforces non-negative subtraction (a ≥ b) and exact integer division (default 20).'}
                  </span>
                </div>
              </div>
            </section>

            {/* Timer Configuration */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">
                  Session Timer
                </h2>
                <p className="text-xs text-slate-500">
                  Continuous equation delivery until countdown reaches zero
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {TIMER_PRESETS.map((sec) => {
                  const active = Number(durationInput) === sec;
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => handlePresetDuration(sec)}
                      className={`min-h-[44px] px-2 rounded-xl border text-sm font-mono-tabular font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'border-[#0F172A] bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {sec}s
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="duration-input"
                  className="block text-sm font-medium text-slate-800"
                >
                  Custom Duration (seconds)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="duration-input"
                    type="number"
                    min={10}
                    max={3600}
                    inputMode="numeric"
                    value={durationInput}
                    onChange={(e) => {
                      setDurationInput(e.target.value);
                      const v = parseInt(e.target.value, 10);
                      if (Number.isFinite(v) && v >= 10 && v <= 3600) {
                        onUpdateConfig({ ...config, durationSeconds: v });
                      }
                    }}
                    onBlur={handleDurationBlur}
                    className="w-28 min-h-[44px] px-3.5 rounded-xl border border-slate-300 bg-white text-base font-mono-tabular font-semibold text-slate-900 focus:outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/20"
                  />
                  <span className="text-xs text-slate-500">
                    Default 60 seconds (1 minute). Range 10s – 3600s.
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Audio & Handwriting Mode */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-slate-700" />
                  <h2 className="text-base font-semibold text-slate-900">
                    Audio Read-Aloud &amp; Finger Handwriting Mode
                  </h2>
                </div>
                <p className="text-xs text-slate-500">
                  Speaks equations via Web Speech API and recognizes written digits on a full-screen touch canvas.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={config.audioEnabled}
                aria-label="Audio Read-Aloud and Finger Handwriting Mode"
                onClick={() =>
                  onUpdateConfig({
                    ...config,
                    audioEnabled: !config.audioEnabled,
                  })
                }
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7] ${
                  config.audioEnabled ? 'bg-[#0284C7]' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-sm transition-transform ${
                    config.audioEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {!speechAvailable && config.audioEnabled && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Web Speech API is unavailable in this browser. Equations will still display visually for handwriting entry.
              </div>
            )}

            {config.audioEnabled && (
              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Voice Preference */}
                <div className="space-y-2.5">
                  <span className="block text-sm font-medium text-slate-800">
                    Voice Preference
                  </span>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                    {(['female', 'male'] as VoiceGender[]).map((gender) => (
                      <button
                        key={gender}
                        type="button"
                        onClick={() =>
                          onUpdateConfig({ ...config, voiceGender: gender })
                        }
                        className={`min-h-[40px] rounded-lg text-sm font-medium capitalize transition-all cursor-pointer ${
                          config.voiceGender === gender
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {gender}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speech Speed */}
                <div className="space-y-2.5">
                  <span className="block text-sm font-medium text-slate-800">
                    Speech Speed
                  </span>
                  <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-100">
                    {SPEECH_RATES.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() =>
                          onUpdateConfig({ ...config, speechRate: rate })
                        }
                        className={`min-h-[40px] rounded-lg text-xs font-mono-tabular font-semibold transition-all cursor-pointer ${
                          config.speechRate === rate
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {rate === 1 ? '1.0x' : `${rate}x`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Handwriting Auto-Submit Pause */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="handwriting-delay"
                      className="text-sm font-medium text-slate-800"
                    >
                      Auto-Submit Pause
                    </label>
                    <span className="text-sm font-mono-tabular font-semibold text-[#0284C7]">
                      {(config.handwritingDelayMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <input
                    id="handwriting-delay"
                    type="range"
                    min={800}
                    max={2500}
                    step={100}
                    value={config.handwritingDelayMs}
                    onChange={(e) =>
                      onUpdateConfig({
                        ...config,
                        handwritingDelayMs: Number(e.target.value),
                      })
                    }
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0284C7] mt-3"
                  />
                  <div className="flex justify-between text-[11px] font-mono-tabular text-slate-400">
                    <span>0.8s</span>
                    <span>1.3s default</span>
                    <span>2.5s</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {prepError && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">{prepError}</div>
            </div>
          )}

          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              disabled={isPreparingOcr}
              onClick={handleStartClick}
              className="w-full sm:w-auto min-h-[52px] px-8 py-3.5 rounded-xl bg-[#0F172A] text-white text-base font-semibold hover:bg-slate-800 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer disabled:opacity-75 disabled:cursor-wait"
            >
              {isPreparingOcr ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Preparing handwriting engine...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Session</span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
