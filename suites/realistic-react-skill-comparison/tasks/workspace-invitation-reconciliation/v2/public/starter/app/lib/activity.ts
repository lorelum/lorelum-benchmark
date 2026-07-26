import type { InvitationActivityRecord, TraceEvent } from "./types";

export type ActivityGates = { record?: Promise<void> };

export class DeterministicActivity {
  readonly trace: TraceEvent[] = [];
  readonly records: InvitationActivityRecord[] = [];
  private sequence = 0;
  private readonly gates: ActivityGates;

  constructor(options: { gates?: ActivityGates } = {}) {
    this.gates = options.gates ?? {};
  }

  private mark(operation: string, key: string): void {
    this.trace.push({ operation, key, sequence: ++this.sequence });
  }

  after(work: () => Promise<void>): void {
    this.mark("after", "invitation-resolution");
    void work().catch(() => undefined);
  }

  async record(record: InvitationActivityRecord): Promise<void> {
    this.mark("record", record.workspaceId);
    await this.gates.record;
    this.records.push({ ...record, invitationIds: [...record.invitationIds] });
  }
}
