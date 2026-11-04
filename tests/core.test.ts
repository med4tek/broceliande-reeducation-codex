import { describe, it, expect } from "vitest";
import {
  applyBatch,
  blankEntity,
  emptyProgram,
  inspectBatch,
  makeBatch,
  now,
  uid,
  undoLast,
  ProgramSchema,
  type Entity,
  type Program,
} from "../src/core";
import { encode, decode } from "../src/transfer";
import { catalogue } from "../src/catalogue";
const clone = <T>(v: T): T => structuredClone(v);
const add = (p: Program, indexes: number[], author = "Démo") =>
  makeBatch(
    p,
    [
      ...p.items,
      ...indexes.map((i) => ({
        ...blankEntity(),
        ...catalogue[i].defaults,
        title: catalogue[i].title,
        catalogueId: catalogue[i].id,
        discipline: catalogue[i].discipline,
        author,
      })),
    ],
    author,
  );
const change = (p: Program, index: number, patch: Partial<Entity>) =>
  makeBatch(
    p,
    p.items.map((e, i) =>
      i === index ? { ...e, ...patch, rev: uid(), modified: now() } : e,
    ),
    "Professionnel",
  );
describe("Collaboration sans perte", () => {
  it("scénario obligatoire : trois postes, 3 → 5 → 7 puis adaptation et désactivation", async () => {
    let p = emptyProgram();
    p = applyBatch(p, add(p, [0, 1, 2], "Kinésithérapeute"));
    expect(p.items).toHaveLength(3);
    // Wire round-trips represent copies on distinct devices; no reference sharing.
    const wire = await decode(
      await encode({ type: "snapshot", schema: 1, program: p }, "secret-test"),
      "secret-test",
    );
    if (wire.type !== "snapshot") throw Error();
    const ergo = applyBatch(p, add(wire.program, [3, 4], "Ergothérapeute"));
    expect(ergo.items).toHaveLength(5);
    const apa = applyBatch(ergo, add(clone(ergo), [5, 6], "EAPA"));
    expect(apa.items).toHaveLength(7);
    const batch = makeBatch(
      apa,
      apa.items.map((e, i) =>
        i === 0
          ? { ...e, reps: 15, rev: uid() }
          : i === 2
            ? { ...e, status: "inactive", rev: uid() }
            : e,
      ),
      "Kinésithérapeute",
    );
    p = applyBatch(apa, batch);
    expect(p.items[0].reps).toBe(15);
    expect(p.items[2].status).toBe("inactive");
    expect(p.items.filter((e) => e.status === "active")).toHaveLength(6);
    expect(new Set(p.items.map((e) => e.discipline)).size).toBe(3);
    expect(p.history).toHaveLength(4);
  });
  it("fusionne des ajouts indépendants obsolètes et ne supprime pas les absents", () => {
    const base = emptyProgram();
    const a = add(base, [0]);
    const b = add(base, [3, 4]);
    let p = applyBatch(base, b);
    p = applyBatch(p, a);
    expect(p.items).toHaveLength(3);
  });
  it("conflit sur le même exercice : décision obligatoire et conservation explicite", () => {
    let p = emptyProgram();
    p = applyBatch(p, add(p, [0]));
    const a = change(p, 0, { reps: 15 }),
      b = change(p, 0, { reps: 20 });
    const updated = applyBatch(p, a);
    expect(inspectBatch(updated, b)).toHaveLength(1);
    expect(() => applyBatch(updated, b)).toThrow("résolution");
    expect(
      applyBatch(updated, b, { [p.items[0].id]: "current" }).items[0].reps,
    ).toBe(15);
    expect(
      applyBatch(updated, b, { [p.items[0].id]: "incoming" }).items[0].reps,
    ).toBe(20);
  });
  it("suppression concurrente et annulation restaurent l’état réellement remplacé", () => {
    let p = emptyProgram();
    p = applyBatch(p, add(p, [0]));
    const remove = change(p, 0, { status: "removed" }),
      edit = change(p, 0, { reps: 20 });
    let updated = applyBatch(p, remove);
    expect(inspectBatch(updated, edit)).toHaveLength(1);
    updated = applyBatch(updated, edit, { [p.items[0].id]: "incoming" });
    expect(undoLast(updated).items[0].status).toBe("removed");
  });
  it("annuler un ajout le marque retiré et le lot initial ne peut pas être rejoué", () => {
    const p = emptyProgram(),
      b = add(p, [0]);
    const next = undoLast(applyBatch(p, b));
    expect(next.items[0].status).toBe("removed");
    expect(() => applyBatch(next, b)).toThrow("déjà");
  });
  it("rejette les doublons et les lots d’un autre programme", () => {
    const p = emptyProgram(),
      b = add(p, [0]);
    expect(() => applyBatch(applyBatch(p, b), b)).toThrow("déjà");
    expect(() => applyBatch(emptyProgram(), b)).toThrow("autre");
  });
  it("refuse les entités dupliquées et les versions inconnues", () => {
    const p = emptyProgram(),
      e = { ...blankEntity(), title: "Test" };
    expect(ProgramSchema.safeParse({ ...p, items: [e, e] }).success).toBe(
      false,
    );
    expect(ProgramSchema.safeParse({ ...p, schema: 9 }).success).toBe(false);
  });
});
describe("Transport chiffré", () => {
  it("restaure un programme volumineux avec historique", async () => {
    let p = emptyProgram();
    const items = Array.from({ length: 200 }, (_, i) => ({
      ...blankEntity(),
      title: "Exercice " + i,
      instructions: "Consigne ".repeat(150),
    }));
    p = applyBatch(p, makeBatch(p, items, "Démo"));
    const code = await encode(
      { type: "snapshot", schema: 1, program: p },
      "long-secret",
    );
    expect(await decode(code, "long-secret")).toEqual({
      type: "snapshot",
      schema: 1,
      program: p,
    });
  });
  it("rejette code court, faux code, corruption et mauvais secret", async () => {
    const code = await encode(
      { type: "snapshot", schema: 1, program: emptyProgram() },
      "secret-test",
    );
    await expect(decode("BROC-1234", "secret-test")).rejects.toThrow();
    await expect(decode("BR1-!!", "secret-test")).rejects.toThrow();
    await expect(decode(code, "incorrect")).rejects.toThrow();
    const at = 80;
    const corrupt =
      code.slice(0, at) + (code[at] === "A" ? "B" : "A") + code.slice(at + 1);
    await expect(decode(corrupt, "secret-test")).rejects.toThrow();
  });
});
