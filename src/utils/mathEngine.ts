import {
  EquationPrompt,
  EquationRecord,
  OperatorSymbol,
  TrainingMode,
} from '../types';

function randInt(min: number, max: number): number {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

export function generateEquation(
  mode: TrainingMode,
  maxDigit: number,
  previousEquation?: string
): EquationPrompt {
  const limit = Math.max(1, Math.min(999, Math.floor(maxDigit)));

  for (let attempt = 0; attempt < 8; attempt++) {
    let prompt: EquationPrompt;

    if (mode === 'multiplication') {
      const a = randInt(1, limit);
      const b = randInt(1, limit);
      prompt = {
        equation: `${a} × ${b}`,
        operand_a: a,
        operator: '×',
        operand_b: b,
        expected_answer: a * b,
      };
    } else {
      const ops: OperatorSymbol[] = ['+', '-', '×', '÷'];
      const op = ops[randInt(0, ops.length - 1)];

      if (op === '+') {
        const a = randInt(1, limit);
        const b = randInt(1, limit);
        prompt = {
          equation: `${a} + ${b}`,
          operand_a: a,
          operator: '+',
          operand_b: b,
          expected_answer: a + b,
        };
      } else if (op === '-') {
        const x = randInt(1, limit);
        const y = randInt(1, limit);
        const a = Math.max(x, y);
        const b = Math.min(x, y);
        prompt = {
          equation: `${a} - ${b}`,
          operand_a: a,
          operator: '-',
          operand_b: b,
          expected_answer: a - b,
        };
      } else if (op === '×') {
        const a = randInt(1, limit);
        const b = randInt(1, limit);
        prompt = {
          equation: `${a} × ${b}`,
          operand_a: a,
          operator: '×',
          operand_b: b,
          expected_answer: a * b,
        };
      } else {
        const divisor = randInt(1, limit);
        const quotient = randInt(1, limit);
        const dividend = divisor * quotient;
        prompt = {
          equation: `${dividend} ÷ ${divisor}`,
          operand_a: dividend,
          operator: '÷',
          operand_b: divisor,
          expected_answer: quotient,
        };
      }
    }

    if (prompt.equation !== previousEquation || limit === 1) {
      return prompt;
    }
  }

  // Fallback if 8 attempts collided
  const a = randInt(1, limit);
  const b = randInt(1, limit);
  return {
    equation: `${a} × ${b}`,
    operand_a: a,
    operator: '×',
    operand_b: b,
    expected_answer: a * b,
  };
}

export interface OperatorStats {
  operator: OperatorSymbol;
  label: string;
  count: number;
  correctCount: number;
  accuracyPct: number;
  avgTimeSec: number;
}

export interface SummaryMetrics {
  total: number;
  correctCount: number;
  accuracyPct: number;
  avgTimeSec: number;
  medianTimeSec: number;
  fastest: EquationRecord | null;
  slowest: EquationRecord | null;
  byOperator: OperatorStats[];
}

const OPERATOR_LABELS: Record<OperatorSymbol, string> = {
  '+': 'Addition (+)',
  '-': 'Subtraction (-)',
  '×': 'Multiplication (×)',
  '÷': 'Division (÷)',
};

export function computeSummaryMetrics(records: EquationRecord[]): SummaryMetrics {
  const total = records.length;
  if (total === 0) {
    return {
      total: 0,
      correctCount: 0,
      accuracyPct: 0,
      avgTimeSec: 0,
      medianTimeSec: 0,
      fastest: null,
      slowest: null,
      byOperator: [],
    };
  }

  const correctCount = records.filter((r) => r.is_correct).length;
  const accuracyPct = (correctCount / total) * 100;

  const timesMs = records.map((r) => r.response_time_ms).sort((a, b) => a - b);
  const sumMs = timesMs.reduce((acc, v) => acc + v, 0);
  const avgTimeSec = sumMs / total / 1000;

  const mid = Math.floor(timesMs.length / 2);
  const medianMs =
    timesMs.length % 2 === 0
      ? (timesMs[mid - 1] + timesMs[mid]) / 2
      : timesMs[mid];
  const medianTimeSec = medianMs / 1000;

  let fastest = records[0];
  let slowest = records[0];
  for (const r of records) {
    if (r.response_time_ms < fastest.response_time_ms) fastest = r;
    if (r.response_time_ms > slowest.response_time_ms) slowest = r;
  }

  const opsOrder: OperatorSymbol[] = ['+', '-', '×', '÷'];
  const byOperator: OperatorStats[] = [];

  for (const op of opsOrder) {
    const subset = records.filter((r) => r.operator === op);
    if (subset.length > 0) {
      const opCorrect = subset.filter((r) => r.is_correct).length;
      const opAvgMs =
        subset.reduce((acc, r) => acc + r.response_time_ms, 0) / subset.length;
      byOperator.push({
        operator: op,
        label: OPERATOR_LABELS[op],
        count: subset.length,
        correctCount: opCorrect,
        accuracyPct: (opCorrect / subset.length) * 100,
        avgTimeSec: opAvgMs / 1000,
      });
    }
  }

  return {
    total,
    correctCount,
    accuracyPct,
    avgTimeSec,
    medianTimeSec,
    fastest,
    slowest,
    byOperator,
  };
}

export interface WeaknessInsight {
  title: string;
  detail: string;
  severity: 'accuracy' | 'speed';
  metricText: string;
}

export function computeWeakSpots(records: EquationRecord[]): WeaknessInsight[] {
  if (records.length === 0) return [];

  const insights: WeaknessInsight[] = [];
  const overallAvgMs =
    records.reduce((acc, r) => acc + r.response_time_ms, 0) / records.length;

  // 1. Operator weaknesses
  const ops: OperatorSymbol[] = ['+', '-', '×', '÷'];
  const opGroups = ops
    .map((op) => {
      const list = records.filter((r) => r.operator === op);
      if (list.length < 2) return null;
      const acc = (list.filter((r) => r.is_correct).length / list.length) * 100;
      const avgMs =
        list.reduce((s, r) => s + r.response_time_ms, 0) / list.length;
      return { op, count: list.length, acc, avgMs };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  if (opGroups.length > 0) {
    const lowestAccOp = [...opGroups].sort((a, b) => a.acc - b.acc)[0];
    if (lowestAccOp.acc < 95) {
      insights.push({
        title: `Accuracy drop on ${OPERATOR_LABELS[lowestAccOp.op]}`,
        detail: `${Math.round(
          (lowestAccOp.acc / 100) * lowestAccOp.count
        )} of ${lowestAccOp.count} solved correctly across uploaded sessions.`,
        severity: 'accuracy',
        metricText: `${lowestAccOp.acc.toFixed(1)}% accuracy`,
      });
    }

    const slowestOp = [...opGroups].sort((a, b) => b.avgMs - a.avgMs)[0];
    if (slowestOp.avgMs > overallAvgMs * 1.05 || opGroups.length > 1) {
      insights.push({
        title: `Slowest recall on ${OPERATOR_LABELS[slowestOp.op]}`,
        detail: `Average latency is ${(slowestOp.avgMs / 1000).toFixed(
          2
        )}s compared to ${(overallAvgMs / 1000).toFixed(2)}s overall.`,
        severity: 'speed',
        metricText: `${(slowestOp.avgMs / 1000).toFixed(2)}s avg`,
      });
    }
  }

  // 2. Operand magnitude bucket weaknesses (using effective mental difficulty operand)
  const buckets = [
    { label: 'Single-digit operands (1–9)', min: 1, max: 9 },
    { label: 'Teens range (10–15)', min: 10, max: 15 },
    { label: 'Upper range (16–25)', min: 16, max: 25 },
    { label: 'Large operands (26+)', min: 26, max: Infinity },
  ];

  const bucketStats = buckets
    .map((b) => {
      const subset = records.filter((r) => {
        const keyOperand =
          r.operator === '÷'
            ? Math.max(r.operand_b, r.expected_answer)
            : Math.max(r.operand_a, r.operand_b);
        return keyOperand >= b.min && keyOperand <= b.max;
      });
      if (subset.length < 3) return null;
      const acc =
        (subset.filter((r) => r.is_correct).length / subset.length) * 100;
      const avgMs =
        subset.reduce((s, r) => s + r.response_time_ms, 0) / subset.length;
      return { ...b, count: subset.length, acc, avgMs };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  if (bucketStats.length > 0) {
    const hardestBucket = [...bucketStats].sort(
      (a, b) => a.acc - b.acc || b.avgMs - a.avgMs
    )[0];
    if (hardestBucket.acc < 92) {
      insights.push({
        title: `Error cluster in ${hardestBucket.label}`,
        detail: `Across ${hardestBucket.count} equations, accuracy dipped to ${hardestBucket.acc.toFixed(
          1
        )}% at ${(hardestBucket.avgMs / 1000).toFixed(2)}s average.`,
        severity: 'accuracy',
        metricText: `${hardestBucket.acc.toFixed(1)}% accuracy`,
      });
    } else {
      const slowestBucket = [...bucketStats].sort((a, b) => b.avgMs - a.avgMs)[0];
      insights.push({
        title: `Highest latency in ${slowestBucket.label}`,
        detail: `Averaged ${(slowestBucket.avgMs / 1000).toFixed(
          2
        )}s per prompt across ${slowestBucket.count} attempts.`,
        severity: 'speed',
        metricText: `${(slowestBucket.avgMs / 1000).toFixed(2)}s avg`,
      });
    }
  }

  // 3. Specific frequently missed or slowest equations
  const missed = records.filter((r) => !r.is_correct);
  if (missed.length > 0) {
    const sampleMissed = missed
      .slice(0, 3)
      .map((r) => `${r.equation} (${r.user_answer || 'blank'} vs ${r.expected_answer})`)
      .join(', ');
    insights.push({
      title: `${missed.length} incorrect response${missed.length > 1 ? 's' : ''} logged`,
      detail: `Examples to drill: ${sampleMissed}.`,
      severity: 'accuracy',
      metricText: `${missed.length} missed`,
    });
  } else if (records.length >= 3) {
    const slowestEq = [...records].sort(
      (a, b) => b.response_time_ms - a.response_time_ms
    )[0];
    insights.push({
      title: `Slowest individual equation: ${slowestEq.equation}`,
      detail: `Solved accurately, but took ${(
        slowestEq.response_time_ms / 1000
      ).toFixed(2)}s to compute.`,
      severity: 'speed',
      metricText: `${(slowestEq.response_time_ms / 1000).toFixed(2)}s`,
    });
  }

  return insights.slice(0, 4);
}
