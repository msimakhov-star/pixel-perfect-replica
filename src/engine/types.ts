export type Topic = "projectile" | "pendulum" | "incline" | "unsupported";

export interface ProblemSpec {
  topic: Topic;
  given: Record<string, number>;
  unknown: string;
  unitsNote?: string;
  questionText?: string;
  confidence: number;
  assumptions: string[];
  readFromPhoto: string[];
  reason?: string;
}

export interface Round {
  round: number;
  measured: number | null;
  reference: number;
  errorPct: number | null;
  perturbationPassed: boolean | null;
  seconds: number;
  costUsd: number;
  feedback?: string;
  status: "match" | "mismatch" | "timeout" | "error";
}

export interface RunRecord {
  id: string;
  spec: ProblemSpec;
  rounds: Round[];
  finalHtml: string;
  unit: string;
  totalCostUsd: number;
}
