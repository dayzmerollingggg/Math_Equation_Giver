export type ViewName =
  | 'VIEW_MAIN_MENU'
  | 'VIEW_SETTINGS'
  | 'VIEW_SESSION'
  | 'VIEW_END_SUMMARY'
  | 'VIEW_ANALYTICS';

export type TrainingMode = 'multiplication' | 'all_symbols';
export type VoiceGender = 'female' | 'male';
export type InputMode = 'visual' | 'audio';
export type OperatorSymbol = '+' | '-' | '×' | '÷';

export interface SessionConfig {
  mode: TrainingMode;
  maxDigit: number;
  audioEnabled: boolean;
  voiceGender: VoiceGender;
  speechRate: number;
  durationSeconds: number;
  handwritingDelayMs: number;
}

export interface EquationPrompt {
  equation: string;
  operand_a: number;
  operator: OperatorSymbol;
  operand_b: number;
  expected_answer: number;
}

export interface EquationRecord {
  timestamp_iso: string;
  mode: TrainingMode;
  max_digit: number;
  input_mode: InputMode;
  equation: string;
  operand_a: number;
  operator: OperatorSymbol;
  operand_b: number;
  expected_answer: number;
  user_answer: string;
  is_correct: boolean;
  response_time_ms: number;
}

export interface UploadedEquationRecord extends EquationRecord {
  sourceFile: string;
  sourceFileIndex: number;
}

export interface SessionState {
  config: SessionConfig;
  accumulatedRecords: EquationRecord[];
  currentRunRecords: EquationRecord[];
}

export const CSV_HEADERS = [
  'timestamp_iso',
  'mode',
  'max_digit',
  'input_mode',
  'equation',
  'operand_a',
  'operator',
  'operand_b',
  'expected_answer',
  'user_answer',
  'is_correct',
  'response_time_ms',
] as const;

export const DEFAULT_CONFIG: SessionConfig = {
  mode: 'multiplication',
  maxDigit: 15,
  audioEnabled: false,
  voiceGender: 'female',
  speechRate: 1.0,
  durationSeconds: 60,
  handwritingDelayMs: 1300,
};
