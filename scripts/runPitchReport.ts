import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ISessionMetrics } from '../core/monitoring/TelemetryService';
import { generateAggregatePitchReport, formatPitchReport } from './generatePitchReport';

// One-command bridge from a browser-exported telemetry history to a rendered
// pitch report. Usage:
//   npm run report:pitch                 # auto-picks the newest telemetry_history-*.json in cwd
//   npm run report:pitch -- ./path.json  # or a explicit path
//
// The exported file is an array of PersistedSession ({ capturedAt, metrics,
// sessionId }); this unwraps .metrics before aggregating. It reports honestly:
// with no sessions it says so rather than inventing numbers.

const HISTORY_PREFIX = 'telemetry_history-';

const findLatestHistory = (dir: string): string | null => {
  const candidates = readdirSync(dir)
    .filter(name => name.startsWith(HISTORY_PREFIX) && name.endsWith('.json'))
    .map(name => join(dir, name));
  if (candidates.length === 0) return null;
  // Newest by modification time, so re-running after a fresh export just works.
  return candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
};

// Accepts either the browser export shape (PersistedSession[]) or a bare
// ISessionMetrics[] and normalizes to the latter.
const extractMetrics = (parsed: unknown): ISessionMetrics[] => {
  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array of sessions.');
  }
  return parsed.map(entry =>
    entry && typeof entry === 'object' && 'metrics' in entry
      ? (entry as { metrics: ISessionMetrics }).metrics
      : (entry as ISessionMetrics)
  );
};

const main = (): void => {
  const argPath = process.argv[2];
  const file = argPath ?? findLatestHistory(process.cwd());

  if (!file) {
    console.error(
      `No telemetry history found. Export one from the app (downloads ${HISTORY_PREFIX}*.json),\n` +
      `then run:  npm run report:pitch -- <path-to-telemetry_history.json>`
    );
    process.exit(1);
    return;
  }

  let history: ISessionMetrics[];
  try {
    history = extractMetrics(JSON.parse(readFileSync(file, 'utf8')));
  } catch (err) {
    console.error(`Failed to read/parse ${file}: ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  // Informational line to stderr so stdout stays clean markdown for piping.
  console.error(`# source: ${file} (${history.length} session(s))\n`);
  console.log(formatPitchReport(generateAggregatePitchReport(history)));
};

main();
