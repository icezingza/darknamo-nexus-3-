const OPEN_TAG = '<cognitive_stream>';
const CLOSE_TAG = '</cognitive_stream>';

export interface StreamParseResult {
  // Text safe to append to the chat UI right now.
  visibleText: string;
  // Populated exactly once, the turn the closing tag is found.
  cognitiveStream?: string;
}

// Incrementally strips a leading <cognitive_stream>...</cognitive_stream>
// block out of a token stream so it never reaches the chat UI, without
// waiting for the full response (which would defeat streaming). Chunk
// boundaries don't align with tag boundaries, so this buffers just enough
// to resolve each state transition and never buffers once the model's
// real reply has started.
export class CognitiveStreamParser {
  private buffer = '';
  private mode: 'detecting' | 'inStream' | 'passthrough' = 'detecting';
  private streamContent = '';

  processChunk(chunk: string): StreamParseResult {
    if (this.mode === 'passthrough') {
      return { visibleText: chunk };
    }

    this.buffer += chunk;

    if (this.mode === 'detecting') {
      if (this.buffer.length < OPEN_TAG.length) {
        if (OPEN_TAG.startsWith(this.buffer)) {
          return { visibleText: '' }; // still ambiguous, hold back
        }
        this.mode = 'passthrough';
        const visible = this.buffer;
        this.buffer = '';
        return { visibleText: visible };
      }

      if (this.buffer.startsWith(OPEN_TAG)) {
        this.mode = 'inStream';
        this.buffer = this.buffer.slice(OPEN_TAG.length);
      } else {
        this.mode = 'passthrough';
        const visible = this.buffer;
        this.buffer = '';
        return { visibleText: visible };
      }
    }

    const closeIndex = this.buffer.indexOf(CLOSE_TAG);
    if (closeIndex === -1) {
      // The close tag itself may be split across this chunk boundary and
      // the next one -- only commit what can no longer be part of a match,
      // keeping a trailing window big enough to complete it.
      const safeLength = Math.max(0, this.buffer.length - (CLOSE_TAG.length - 1));
      this.streamContent += this.buffer.slice(0, safeLength);
      this.buffer = this.buffer.slice(safeLength);
      return { visibleText: '' };
    }

    this.streamContent += this.buffer.slice(0, closeIndex);
    const remainder = this.buffer.slice(closeIndex + CLOSE_TAG.length);
    this.buffer = '';
    this.mode = 'passthrough';
    return { visibleText: remainder.replace(/^\s+/, ''), cognitiveStream: this.streamContent.trim() };
  }

  // Call once the underlying stream has ended. If the model never resolved
  // whether the tag was present, whatever's buffered is ordinary text that
  // just happened to look like a partial tag prefix -- surface it rather
  // than dropping it. If the block opened but was truncated before closing
  // (e.g. cut off by a token limit), surface the partial capture as
  // cognitiveStream (not as visible chat text) so it's still inspectable.
  flushRemaining(): StreamParseResult {
    if (this.mode === 'passthrough') return { visibleText: '' };
    if (this.mode === 'detecting') {
      const leftover = this.buffer;
      this.buffer = '';
      this.mode = 'passthrough';
      return { visibleText: leftover };
    }
    const partial = this.streamContent + this.buffer;
    this.streamContent = '';
    this.buffer = '';
    this.mode = 'passthrough';
    return { visibleText: '', cognitiveStream: partial };
  }
}
