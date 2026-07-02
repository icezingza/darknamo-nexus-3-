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

interface ParsedEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const parseRecord = (record: MemoryRecord): ParsedEntry | null => {
  const userMatch = record.content.match(/^\(user\)\s?([\s\S]*)$/);
  if (userMatch) return { role: 'user', content: userMatch[1], timestamp: record.timestamp };

  const modelMatch = record.content.match(/^\(model\)\s?([\s\S]*)$/);
  if (modelMatch) return { role: 'assistant', content: modelMatch[1], timestamp: record.timestamp };

  return null;
};

export class DataExporter {
  constructor(
    private memoryRepository: MemoryRepository,
    private telemetryService: TelemetryService
  ) {}

  exportToJsonl(minEmotionWeight = HIGH_VALUE_EMOTION_WEIGHT): string {
    const records = this.memoryRepository.findHighValueMemories(minEmotionWeight);
    const examples = this.buildExamples(records);
    this.telemetryService.recordDataExport(examples.length);
    return examples.map(example => JSON.stringify(example)).join('\n');
  }

  private buildExamples(records: MemoryRecord[]): JsonlExample[] {
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
        examples.push({
          messages: [
            { role: 'user', content: scrubPII(current.content) },
            { role: 'assistant', content: scrubPII(next.content) }
          ]
        });
        i += 2;
      } else {
        i += 1;
      }
    }
    return examples;
  }
}
