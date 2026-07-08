import { MemoryRecord } from '../domain/MemoryRecord';
import { MemoryRepository } from '../../services/MemoryRepository';
import { TelemetryService } from '../monitoring/TelemetryService';

const HIGH_VALUE_EMOTION_WEIGHT = 0.8;

// Basic, best-effort scrubbers -- not an exhaustive PII detector, just a
// safety guardrail before anything leaves the browser as a downloaded file.
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:\+?\d{1,3}[-\s.]?)?(?:\d[-\s.]?){8,12}\d/g;

const scrubPII = (text: string): string =>
  text
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]');

export interface JsonlMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface JsonlExample {
  messages: JsonlMessage[];
}

// Real, observed counts describing the golden dataset produced alongside the
// .jsonl. Every field is derived from the actual MemoryRepository contents at
// export time -- nothing here is projected, extrapolated, or synthesized.
export interface PitchSummary {
  generatedAt: string;
  minEmotionWeight: number;
  totalRecords: number;
  highValueMemoryCount: number;
  goldenExampleCount: number;
}

interface ParsedEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  emotionWeight: number;
}

const parseRecord = (record: MemoryRecord): ParsedEntry | null => {
  const userMatch = record.content.match(/^\(user\)\s?([\s\S]*)$/);
  if (userMatch) {
    return { role: 'user', content: userMatch[1], timestamp: record.timestamp, emotionWeight: record.emotionWeight };
  }

  const modelMatch = record.content.match(/^\(model\)\s?([\s\S]*)$/);
  if (modelMatch) {
    return { role: 'assistant', content: modelMatch[1], timestamp: record.timestamp, emotionWeight: record.emotionWeight };
  }

  return null;
};

export class DataExporter {
  constructor(
    private memoryRepository: MemoryRepository,
    private telemetryService: TelemetryService
  ) {}

  exportToJsonl(minEmotionWeight = HIGH_VALUE_EMOTION_WEIGHT): string {
    // Fetch every non-forgotten record (not pre-filtered by weight) so pairing
    // below always lines up adjacent turns from the same conversation, then
    // filter the resulting pairs by weight -- filtering records individually
    // before pairing would drop one side of a turn and mispair leftovers from
    // unrelated turns.
    const records = this.memoryRepository.findHighValueMemories(-1);
    const examples = this.buildExamples(records, minEmotionWeight);
    this.telemetryService.recordDataExport(examples.length);
    return examples.map(example => JSON.stringify(example)).join('\n');
  }

  // Metadata companion to the .jsonl. Recomputes the same golden pairs so the
  // reported count always matches what exportToJsonl would emit at the same
  // threshold, and counts high-value records straight from the repository.
  buildPitchSummary(minEmotionWeight = HIGH_VALUE_EMOTION_WEIGHT): PitchSummary {
    const records = this.memoryRepository.findHighValueMemories(-1);
    const examples = this.buildExamples(records, minEmotionWeight);
    return {
      generatedAt: new Date().toISOString(),
      minEmotionWeight,
      totalRecords: records.length,
      // A record is "high value" if it clears the same threshold used to keep
      // a golden pair -- '>' matches buildExamples' comparison exactly.
      highValueMemoryCount: records.filter(r => r.emotionWeight > minEmotionWeight).length,
      goldenExampleCount: examples.length
    };
  }

  buildPitchSummaryJson(minEmotionWeight = HIGH_VALUE_EMOTION_WEIGHT): string {
    return JSON.stringify(this.buildPitchSummary(minEmotionWeight), null, 2);
  }

  private buildExamples(records: MemoryRecord[], minEmotionWeight: number): JsonlExample[] {
    const parsed = records
      .map(parseRecord)
      .filter((entry): entry is ParsedEntry => entry !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    const examples: JsonlExample[] = [];
    let i = 0;
    while (i < parsed.length - 1) {
      const current = parsed[i];
      const next = parsed[i + 1];
      if (current.role === 'user' && next.role === 'assistant') {
        if (current.emotionWeight > minEmotionWeight || next.emotionWeight > minEmotionWeight) {
          examples.push({
            messages: [
              { role: 'user', content: scrubPII(current.content) },
              { role: 'assistant', content: scrubPII(next.content) }
            ]
          });
        }
        i += 2;
      } else {
        i += 1;
      }
    }
    return examples;
  }
}
