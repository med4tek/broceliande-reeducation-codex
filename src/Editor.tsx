import { useState } from "react";
import {
  blankEntity,
  disciplines,
  EntitySchema,
  now,
  uid,
  type Entity,
} from "./core";
import { catalogue } from "./catalogue";
export function Editor({
  entity,
  author,
  discipline,
  onSave,
  onClose,
}: {
  entity?: Entity;
  author: string;
  discipline: Entity["discipline"];
  onSave: (e: Entity) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<Entity>(
    entity ?? { ...blankEntity(), discipline },
  );
  const [error, setError] = useState("");
  function field<K extends keyof Entity>(key: K, v: Entity[K]) {
    setValue({ ...value, [key]: v });
  }
  const clinical = catalogue.find((c) => c.id === value.catalogueId);
  return (
    <div className="overlay">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Éditeur"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (
              value.status === "removed" &&
              entity?.status !== "removed" &&
              !confirm(
                "Retirer cet élément du programme ? Son historique sera conservé.",
              )
            )
              return;
            if (
              entity &&
              entity.discipline !== discipline &&
              !confirm(
                "Vous modifiez une prescription d’une autre discipline. Confirmer ?",
              )
            )
              return;
            onSave(
              EntitySchema.parse({
                ...value,
                rev: uid(),
                modified: now(),
                author,
              }),
            );
          } catch {
            setError("Vérifiez les champs et les limites de dosage.");
          }
        }}
      >
        <button
          type="button"
          className="close"
          onClick={onClose}
          aria-label="Fermer"
        >
          ×
        </button>
        <span className="eyebrow">ESPACE PROFESSIONNEL</span>
        <h2>{entity ? "Adapter la prescription" : "Ajouter au programme"}</h2>
        {!entity && (
          <>
            <label>
              Type
              <select
                value={value.kind}
                onChange={(e) =>
                  field("kind", e.target.value as Entity["kind"])
                }
              >
                <option value="exercise">Exercice</option>
                <option value="goal">Objectif fonctionnel</option>
              </select>
            </label>
            {value.kind === "exercise" && (
              <label>
                Bibliothèque de démonstration
                <select
                  value={value.catalogueId}
                  onChange={(e) => {
                    const c = catalogue.find((c) => c.id === e.target.value);
                    if (c)
                      setValue({
                        ...value,
                        catalogueId: c.id,
                        title: c.title,
                        discipline: c.discipline,
                        instructions: c.instructions,
                        ...c.defaults,
                      });
                  }}
                >
                  <option value="">Choisir un exercice…</option>
                  {catalogue.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} · {c.discipline}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <label>
          {value.kind === "goal" ? "Mon objectif concret" : "Nom de l’exercice"}
          <input
            required
            maxLength={150}
            value={value.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </label>
        <label>
          Discipline d’origine
          <select
            disabled={!!entity}
            value={value.discipline}
            onChange={(e) =>
              field("discipline", e.target.value as Entity["discipline"])
            }
          >
            {disciplines.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        {value.kind === "exercise" ? (
          <>
            <div className="form-grid">
              {(
                [
                  ["series", "Séries", 100],
                  ["reps", "Répétitions", 1000],
                  ["minutes", "Durée (min)", 1440],
                  ["rest", "Repos (secondes)", 3600],
                ] as const
              ).map(([k, title, max]) => (
                <label key={k}>
                  {title}
                  <input
                    type="number"
                    min="0"
                    max={max}
                    required
                    value={value[k]}
                    onChange={(e) => field(k, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <label>
              Fréquence
              <input
                maxLength={150}
                value={value.frequency}
                onChange={(e) => field("frequency", e.target.value)}
              />
            </label>
          </>
        ) : (
          <label>
            Progression : {value.progress} %
            <input
              type="range"
              min="0"
              max="100"
              value={value.progress}
              onChange={(e) => field("progress", Number(e.target.value))}
            />
          </label>
        )}
        <label>
          Consignes individualisées
          <textarea
            maxLength={2000}
            value={value.instructions}
            onChange={(e) => field("instructions", e.target.value)}
          />
        </label>
        <label>
          Adaptations
          <textarea
            maxLength={2000}
            value={value.adaptations}
            onChange={(e) => field("adaptations", e.target.value)}
          />
        </label>
        {clinical && (
          <aside className="notice">
            <strong>Contenu clinique de démonstration</strong>
            <p>{clinical.objective}</p>
            <p>
              Matériel : {clinical.equipment}. {clinical.precautions}
            </p>
          </aside>
        )}
        <label>
          État
          <select
            value={value.status}
            onChange={(e) =>
              field("status", e.target.value as Entity["status"])
            }
          >
            <option value="active">Actif</option>
            <option value="inactive">Désactivé</option>
            <option value="removed">Retiré (conservé dans l’historique)</option>
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary">Enregistrer dans le brouillon</button>
      </form>
    </div>
  );
}
