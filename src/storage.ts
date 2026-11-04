import { ProgramSchema, type Program } from "./core";
export type Tracking = { id: string; date: string; status: string };
export type LocalData = { program: Program; tracking: Tracking[] };
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      import.meta.env.BASE_URL === "/"
        ? "broceliande-local"
        : "broceliande-local:" + import.meta.env.BASE_URL,
      1,
    );
    request.onupgradeneeded = () => request.result.createObjectStore("patient");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadLocal(): Promise<LocalData | null> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("patient").objectStore("patient").get("data");
      r.onsuccess = () => {
        try {
          resolve(
            r.result
              ? {
                  program: ProgramSchema.parse(r.result.program),
                  tracking: r.result.tracking ?? [],
                }
              : null,
          );
        } catch (e) {
          reject(e);
        }
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function saveLocal(
  data: LocalData | null,
  expected: LocalData | null,
) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("patient", "readwrite");
      const store = tx.objectStore("patient");
      const read = store.get("data");
      read.onsuccess = () => {
        // Compare and write within the same transaction: a stale tab cannot overwrite another.
        if (JSON.stringify(read.result ?? null) !== JSON.stringify(expected)) {
          reject(
            new Error(
              "Un autre onglet a modifié les données. Rechargez cette page pour récupérer la version actuelle avant de continuer.",
            ),
          );
          tx.abort();
          return;
        }
        if (data) store.put(data, "data");
        else store.clear();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
