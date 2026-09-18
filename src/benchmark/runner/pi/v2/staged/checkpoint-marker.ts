const defaultCheckpointMarker = "CHECKPOINT: compatibility-slice-ready" as const;

export const checkpointMarker = defaultCheckpointMarker;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textHasCheckpointMarker(value: unknown, marker: string): boolean {
  return typeof value === "string" && value.split(/\r?\n/).some((line) => line.trim() === marker);
}

function assistantContentHasCheckpointMarker(value: unknown, marker: string): boolean {
  if (typeof value === "string") return textHasCheckpointMarker(value, marker);
  if (!Array.isArray(value)) return false;
  return value.some((entry) => isRecord(entry) && entry.type === "text" && textHasCheckpointMarker(entry.text, marker));
}

export function assistantEventHasCheckpointMarker(value: unknown, marker: string = checkpointMarker): boolean {
  if (!isRecord(value) || (value.type !== "message_start" && value.type !== "message_update" && value.type !== "message_end")) return false;
  const message = value.message;
  if (!isRecord(message) || message.role !== "assistant") return false;
  if (assistantContentHasCheckpointMarker(message.content, marker)) return true;
  const assistantMessageEvent = value.assistantMessageEvent;
  if (!isRecord(assistantMessageEvent)) return false;
  if (assistantMessageEvent.type === "text_delta" || assistantMessageEvent.type === "text_end") {
    if (textHasCheckpointMarker(assistantMessageEvent.delta, marker) || textHasCheckpointMarker(assistantMessageEvent.content, marker)) return true;
  }
  return isRecord(assistantMessageEvent.partial) && assistantContentHasCheckpointMarker(assistantMessageEvent.partial.content, marker);
}

export function hasCheckpointMarker(output: string, marker = checkpointMarker): boolean {
  return output.split(/\r?\n/).some((line) => {
    try { return assistantEventHasCheckpointMarker(JSON.parse(line), marker); } catch { return false; }
  });
}

export function hasGracefulCheckpointStop(output: string, marker = checkpointMarker): boolean {
  let markerObserved = false;
  return output.split(/\r?\n/).some((line) => {
    try {
      const value = JSON.parse(line) as unknown;
      const gracefulStop = isRecord(value)
        && value.type === "message_end"
        && isRecord(value.message)
        && value.message.role === "assistant"
        && value.message.stopReason === "aborted";
      markerObserved ||= assistantEventHasCheckpointMarker(value, marker);
      return markerObserved && gracefulStop;
    } catch {
      return false;
    }
  });
}
