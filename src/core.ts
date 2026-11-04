import { z } from "zod";
export const disciplines = [
  "Kinésithérapie",
  "Ergothérapie",
  "Activité physique adaptée",
  "Médecine",
  "Autres",
] as const;
const uuid = z.uuid();
const text = z.string().max(2000);
export const EntitySchema = z
  .object({
    id: uuid,
    rev: uuid,
    kind: z.enum(["exercise", "goal"]),
    catalogueId: z.string().max(80),
    title: z.string().min(1).max(150),
    discipline: z.enum(disciplines),
    series: z.number().int().min(0).max(100),
    reps: z.number().int().min(0).max(1000),
    minutes: z.number().min(0).max(1440),
    frequency: z.string().max(150),
    rest: z.number().min(0).max(3600),
    instructions: text,
    adaptations: text,
    progress: z.number().int().min(0).max(100),
    status: z.enum(["active", "inactive", "removed"]),
    modified: z.iso.datetime(),
    author: z.string().max(100),
  })
  .strict();
export type Entity = z.infer<typeof EntitySchema>;
const OpSchema = z
  .object({ id: uuid, before: EntitySchema.nullable(), after: EntitySchema })
  .strict()
  .refine(
    (o) => o.id === o.after.id && (!o.before || o.id === o.before.id),
    "Identifiant incohérent",
  )
  .refine(
    (o) =>
      !o.before ||
      (o.before.rev !== o.after.rev &&
        o.before.kind === o.after.kind &&
        o.before.discipline === o.after.discipline),
    "Révision ou origine invalide",
  );
const BatchSchema = z
  .object({
    schema: z.literal(1),
    id: uuid,
    programId: uuid,
    baseRevision: z.number().int().min(0),
    created: z.iso.datetime(),
    author: z.string().max(100),
    ops: z.array(OpSchema).min(1).max(500),
  })
  .strict()
  .refine(
    (b) => new Set(b.ops.map((o) => o.id)).size === b.ops.length,
    "Exercice répété dans un lot",
  );
export type Batch = z.infer<typeof BatchSchema>;
const EventSchema = z
  .object({
    batch: BatchSchema,
    at: z.iso.datetime(),
    accepted: z.array(uuid).max(500),
  })
  .strict();
export const ProgramSchema = z
  .object({
    schema: z.literal(1),
    id: uuid,
    revision: z.number().int().min(0),
    items: z.array(EntitySchema).max(500),
    applied: z.array(uuid).max(5000),
    history: z.array(EventSchema).max(5000),
  })
  .strict()
  .refine(
    (p) => new Set(p.items.map((e) => e.id)).size === p.items.length,
    "Identifiants en double",
  )
  .refine(
    (p) => p.history.every((h) => h.batch.programId === p.id),
    "Historique incohérent",
  );
export type Program = z.infer<typeof ProgramSchema>;
export const PayloadSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("snapshot"),
      schema: z.literal(1),
      program: ProgramSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("batch"),
      schema: z.literal(1),
      batch: BatchSchema,
    })
    .strict(),
]);
export type Payload = z.infer<typeof PayloadSchema>;
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function emptyProgram(): Program {
  return {
    schema: 1,
    id: uid(),
    revision: 0,
    items: [],
    applied: [],
    history: [],
  };
}
export function blankEntity(kind: Entity["kind"] = "exercise"): Entity {
  return {
    id: uid(),
    rev: uid(),
    kind,
    catalogueId: "",
    title: "",
    discipline: "Kinésithérapie",
    series: 3,
    reps: 10,
    minutes: 0,
    frequency: "Chaque jour",
    rest: 60,
    instructions: "",
    adaptations: "",
    progress: 0,
    status: "active",
    modified: now(),
    author: "",
  };
}
export function makeBatch(
  base: Program,
  items: Entity[],
  author: string,
): Batch {
  const ops = items
    .filter((e) => base.items.find((b) => b.id === e.id)?.rev !== e.rev)
    .map((after) => ({
      id: after.id,
      before: base.items.find((e) => e.id === after.id) ?? null,
      after,
    }));
  return BatchSchema.parse({
    schema: 1,
    id: uid(),
    programId: base.id,
    baseRevision: base.revision,
    created: now(),
    author,
    ops,
  });
}
export function inspectBatch(program: Program, batch: Batch) {
  BatchSchema.parse(batch);
  if (program.id !== batch.programId)
    throw Error("Ce lot appartient à un autre programme.");
  if (program.applied.includes(batch.id))
    throw Error("Ce lot a déjà été importé.");
  return batch.ops.filter((o) => {
    const current = program.items.find((e) => e.id === o.id);
    return o.before ? !current || current.rev !== o.before.rev : !!current;
  });
}
export function applyBatch(
  program: Program,
  batch: Batch,
  choices: Record<string, "current" | "incoming"> = {},
): Program {
  const conflicts = inspectBatch(program, batch);
  if (conflicts.some((o) => !choices[o.id]))
    throw Error("Choisissez une résolution pour chaque conflit.");
  const items = structuredClone(program.items);
  const accepted: string[] = [];
  // Audit stores the actual state before merging, so undo preserves independent changes.
  const actualOps: Batch["ops"] = [];
  for (const op of batch.ops) {
    if (conflicts.some((c) => c.id === op.id) && choices[op.id] === "current")
      continue;
    const index = items.findIndex((e) => e.id === op.id);
    const before = index < 0 ? null : items[index];
    if (
      before &&
      (before.kind !== op.after.kind ||
        before.discipline !== op.after.discipline)
    )
      throw Error("La discipline d’origine et le type sont immuables.");
    const after = structuredClone(op.after);
    if (index < 0) items.push(after);
    else items[index] = after;
    accepted.push(op.id);
    actualOps.push({ ...op, before });
  }
  const result = {
    ...program,
    items,
    revision: program.revision + 1,
    applied: [...program.applied, batch.id],
    history: [
      ...program.history,
      {
        batch: { ...batch, ops: actualOps.length ? actualOps : batch.ops },
        at: now(),
        accepted,
      },
    ],
  };
  return ProgramSchema.parse(result);
}
export function undoLast(program: Program): Program {
  const event = [...program.history].reverse().find((h) => h.accepted.length);
  if (!event) throw Error("Aucune modification à annuler.");
  const ops = event.batch.ops
    .filter((o) => event.accepted.includes(o.id))
    .map((o) => {
      const current = program.items.find((e) => e.id === o.id);
      if (!current || current.rev !== o.after.rev)
        throw Error("Une modification ultérieure empêche cette annulation.");
      return {
        id: o.id,
        before: current,
        after: {
          ...(o.before ?? current),
          rev: uid(),
          status: o.before?.status ?? ("removed" as const),
          modified: now(),
          author: "Annulation locale",
        },
      };
    });
  return applyBatch(program, {
    schema: 1,
    id: uid(),
    programId: program.id,
    baseRevision: program.revision,
    created: now(),
    author: "Annulation locale",
    ops,
  });
}
