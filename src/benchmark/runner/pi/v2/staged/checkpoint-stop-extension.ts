import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { assistantEventHasCheckpointMarker, checkpointMarker } from "./checkpoint-marker";

export default function checkpointStopExtension(pi: ExtensionAPI): void {
  let stopRequested = false;
  pi.on("message_update", (event, ctx) => {
    if (stopRequested || ctx.signal?.aborted || !assistantEventHasCheckpointMarker(event, checkpointMarker)) return;
    stopRequested = true;
    ctx.abort();
  });
}
