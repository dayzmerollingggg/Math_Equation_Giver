import { OperatorSymbol, VoiceGender } from '../types';

const FEMALE_HINTS = [
  'female',
  'samantha',
  'victoria',
  'karen',
  'tessa',
  'fiona',
  'moira',
  'veena',
  'martha',
  'zira',
  'hazel',
  'susan',
  'aria',
  'jenny',
  'sara',
  'serena',
  'kate',
  'ava',
  'allison',
  'nicky',
  'google us english',
  'libby',
  'sonia',
];

const MALE_HINTS = [
  'male',
  'daniel',
  'alex',
  'fred',
  'oliver',
  'tom',
  'david',
  'mark',
  'george',
  'guy',
  'ryan',
  'arthur',
  'aaron',
  'gordon',
  'lee',
  'rishi',
  'google uk english male',
];

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function pickVoice(gender: VoiceGender): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const englishVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith('en')
  );
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  const hints = gender === 'female' ? FEMALE_HINTS : MALE_HINTS;
  const oppositeHints = gender === 'female' ? MALE_HINTS : FEMALE_HINTS;

  const exactMatch = pool.find((v) => {
    const name = v.name.toLowerCase();
    return (
      hints.some((h) => name.includes(h)) &&
      !oppositeHints.some((o) => name.includes(o) && !name.includes(gender))
    );
  });
  if (exactMatch) return exactMatch;

  const looseMatch = pool.find((v) => {
    const name = v.name.toLowerCase();
    return hints.some((h) => name.includes(h));
  });
  if (looseMatch) return looseMatch;

  return pool.find((v) => v.default) || pool[0] || null;
}

export function unlockSpeechSynthesis(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Graceful no-op if browser restricts silent utterance
  }
}

export function stopSpeech(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore
  }
}

export function formatEquationForSpeech(
  a: number,
  operator: OperatorSymbol,
  b: number
): string {
  const opWords: Record<OperatorSymbol, string> = {
    '×': 'times',
    '÷': 'divided by',
    '-': 'minus',
    '+': 'plus',
  };
  return `${a} ${opWords[operator]} ${b}`;
}

export function speakText(
  text: string,
  gender: VoiceGender,
  rate: number,
  onEnd?: () => void
): () => void {
  if (!isSpeechSupported()) {
    if (onEnd) {
      const id = window.setTimeout(onEnd, 100);
      return () => window.clearTimeout(id);
    }
    return () => {};
  }

  let finished = false;
  const triggerEnd = () => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(gender);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = rate;
    utterance.lang = voice?.lang || 'en-US';
    utterance.onend = triggerEnd;
    utterance.onerror = triggerEnd;

    // Safety fallback timer in case a browser drops onend silently
    const fallbackMs = Math.max(2500, Math.round((text.length * 140) / rate));
    const safetyTimer = window.setTimeout(triggerEnd, fallbackMs);

    window.speechSynthesis.speak(utterance);

    return () => {
      finished = true;
      window.clearTimeout(safetyTimer);
      utterance.onend = null;
      utterance.onerror = null;
      stopSpeech();
    };
  } catch {
    const id = window.setTimeout(triggerEnd, 100);
    return () => window.clearTimeout(id);
  }
}
