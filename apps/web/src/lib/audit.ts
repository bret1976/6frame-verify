import { query } from "./db";

export async function audit(event: {
  tenant_id?: string | null;
  actor_type: string;
  actor_id?: string | null;
  action: string;
  object_type?: string;
  object_id?: string;
  metadata?: Record<string, unknown>;
}) {
  await query(
    `INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, object_type, object_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      event.tenant_id ?? null,
      event.actor_type,
      event.actor_id ?? null,
      event.action,
      event.object_type ?? null,
      event.object_id ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}
