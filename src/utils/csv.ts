import {
  CSV_HEADERS,
  InputMode,
  OperatorSymbol,
  TrainingMode,
  UploadedEquationRecord,
  EquationRecord,
} from '../types';

function escapeCsvCell(value: string | number | boolean): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvContent(records: EquationRecord[]): string {
  const headerLine = CSV_HEADERS.join(',');
  const rows = records.map((r) =>
    [
      r.timestamp_iso,
      r.mode,
      r.max_digit,
      r.input_mode,
      r.equation,
      r.operand_a,
      r.operator,
      r.operand_b,
      r.expected_answer,
      r.user_answer,
      r.is_correct ? 'true' : 'false',
      r.response_time_ms,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headerLine, ...rows].join('\n');
}

export function buildCsvFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `math_session_${yyyy}-${mm}-${dd}_${hh}${min}.csv`;
}

export function downloadCsvFile(records: EquationRecord[]): void {
  const csv = generateCsvContent(records);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', buildCsvFilename());
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  cells.push(current);
  return cells;
}

function normalizeOperator(raw: string): OperatorSymbol | null {
  const trimmed = raw.trim();
  if (trimmed === '+') return '+';
  if (trimmed === '-') return '-';
  if (trimmed === '×' || trimmed === '*') return '×';
  if (trimmed === '÷' || trimmed === '/') return '÷';
  return null;
}

export interface CsvValidationResult {
  valid: boolean;
  records: UploadedEquationRecord[];
  error?: string;
}

export function validateAndParseCsvFiles(
  files: { name: string; content: string }[]
): CsvValidationResult {
  if (files.length === 0) {
    return {
      valid: false,
      records: [],
      error: 'No CSV files were selected.',
    };
  }

  const allRecords: UploadedEquationRecord[] = [];
  const expectedHeader = CSV_HEADERS.join(',');

  for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
    const file = files[fileIdx];
    const cleanContent = file.content.replace(/^\uFEFF/, '');
    const lines = cleanContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return {
        valid: false,
        records: [],
        error: `Invalid CSV format in "${file.name}": file must include the exact header row and at least one data row.`,
      };
    }

    const headerCells = parseCsvRow(lines[0]).map((c) => c.trim());
    if (
      headerCells.length !== CSV_HEADERS.length ||
      headerCells.join(',') !== expectedHeader
    ) {
      return {
        valid: false,
        records: [],
        error: `Invalid CSV format in "${file.name}": headers do not match app-generated files (expected ${expectedHeader}).`,
      };
    }

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const cols = parseCsvRow(lines[rowIdx]);
      if (cols.length !== 12) {
        return {
          valid: false,
          records: [],
          error: `Invalid CSV format in "${file.name}" at row ${
            rowIdx + 1
          }: expected 12 columns, found ${cols.length}.`,
        };
      }

      const [
        timestamp_iso,
        modeRaw,
        maxDigitRaw,
        inputModeRaw,
        equation,
        operandARaw,
        operatorRaw,
        operandBRaw,
        expectedAnswerRaw,
        user_answer,
        isCorrectRaw,
        responseTimeMsRaw,
      ] = cols.map((c) => c.trim());

      if (!timestamp_iso || Number.isNaN(Date.parse(timestamp_iso))) {
        return {
          valid: false,
          records: [],
          error: `Invalid CSV format in "${file.name}" at row ${
            rowIdx + 1
          }: invalid ISO timestamp "${timestamp_iso}".`,
        };
      }

      if (modeRaw !== 'multiplication' && modeRaw !== 'all_symbols') {
        return {
          valid: false,
          records: [],
          error: `Invalid CSV format in "${file.name}" at row ${
            rowIdx + 1
          }: mode must be "multiplication" or "all_symbols".`,
        };
      }

      if (inputModeRaw !== 'visual' && inputModeRaw !== 'audio') {
        return {
          valid: false,
          records: [],
          error: `Invalid CSV format in "${file.name}" at row ${
            rowIdx + 1
          }: input_mode must be "visual" or "audio".`,
        };
      }

      const max_digit = Number(maxDigitRaw);
      const operand_a = Number(operandARaw);
      const operand_b = Number(operandBRaw);
      const expected_answer = Number(expectedAnswerRaw);
      const response_time_ms = Number(responseTimeMsRaw);

      if (
        maxDigitRaw === '' ||
        operandARaw === '' ||
        operandBRaw === '' ||
        expectedAnswerRaw === '' ||
        responseTimeMsRaw === '' ||
        !Number.isFinite(max_digit) ||
        !Number.isFinite(operand_a) ||
        !Number.isFinite(operand_b) ||
        !Number.isFinite(expected_answer) ||
        !Number.isFinite(response_time_ms) ||
        response_time_ms < 0
      ) {
        return {
          valid: false,
          records: [],
          error: `Invalid CSV format in "${file.name}" at row ${
            rowIdx + 1
          }: numeric columns contain invalid values.`,
        };
      }

      const normalizedOp = normalizeOperator(operatorRaw);
      if (!normalizedOp) {
        return {
          valid: false,
          records: [],
          error: `Invalid CSV format in "${file.name}" at row ${
            rowIdx + 1
          }: invalid operator "${operatorRaw}".`,
        };
      }

      const boolLower = isCorrectRaw.toLowerCase();
      if (boolLower !== 'true' && boolLower !== 'false') {
        return {
          valid: false,
          records: [],
          error: `Invalid CSV format in "${file.name}" at row ${
            rowIdx + 1
          }: is_correct must be "true" or "false".`,
        };
      }

      if (!equation) {
        return {
          valid: false,
          records: [],
          error: `Invalid CSV format in "${file.name}" at row ${
            rowIdx + 1
          }: equation field cannot be empty.`,
        };
      }

      allRecords.push({
        timestamp_iso,
        mode: modeRaw as TrainingMode,
        max_digit,
        input_mode: inputModeRaw as InputMode,
        equation,
        operand_a,
        operator: normalizedOp,
        operand_b,
        expected_answer,
        user_answer,
        is_correct: boolLower === 'true',
        response_time_ms,
        sourceFile: file.name,
        sourceFileIndex: fileIdx,
      });
    }
  }

  return {
    valid: true,
    records: allRecords,
  };
}
