/**
 * 遊び画面から結果画面へ、終わった遊びの結果を渡す（画面の引数に記録を載せないため）。
 */
import type { NewRecord } from '../domain/records';

export type SessionResult =
  | { recorded: true; record: NewRecord }
  | { recorded: false };

let latest: SessionResult | null = null;

export function setLatestResult(result: SessionResult): void {
  latest = result;
}

export function getLatestResult(): SessionResult | null {
  return latest;
}

export function clearLatestResult(): void {
  latest = null;
}
