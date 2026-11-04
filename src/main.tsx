import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  applyBatch,
  blankEntity,
  disciplines,
  emptyProgram,
  inspectBatch,
  makeBatch,
  now,
  uid,
  undoLast,
  type Batch,
  type Entity,
  type Payload,
  type Program,
} from "./core";
import { catalogue } from "./catalogue";
import { loadLocal, saveLocal, type Tracking } from "./storage";
import { Transfer } from "./Transfer";
import { Editor } from "./Editor";
import "./style.css";
import { InstallQr } from "./InstallQr";
type Mode = "patient" | "desktop" | "phone";
function App() {
  const [mode, setMode] = useState<Mode | null>(null),
    [p, setP] = useState<Program | null>(null),
    [stored, setStored] = useState<Program | null>(null),
    [draft, setDraft] = useState<Entity[]>([]),
    [tracking, setTracking] = useState<Tracking[]>([]),
    [savedTracking, setSavedTracking] = useState<Tracking[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("exercises"),
    [filter, setFilter] = useState("Tous"),
    [author, setAuthor] = useState(""),
    [discipline, setDiscipline] =
      useState<Entity["discipline"]>("Kinésithérapie"),
    [editor, setEditor] = useState<Entity | "new" | null>(null),
    [transfer, setTransfer] = useState<Payload | "import" | null>(null),
    [pending, setPending] = useState<Payload | null>(null),
    [choices, setChoices] = useState<Record<string, "current" | "incoming">>(
      {},
    ),
    [lastBatch, setLastBatch] = useState<Batch | null>(null),
    [help, setHelp] = useState(false);
  useEffect(() => {
    loadLocal()
      .then((data) => {
        if (data) {
          setStored(data.program);
          setTracking(data.tracking);
          setSavedTracking(data.tracking);
        }
      })
      .catch(() =>
        setMessage(
          "Le stockage local n’est pas accessible ou est corrompu. Aucune donnée existante n’a été effacée.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const ready = () =>
      setMessage("Application disponible hors ligne sur cet appareil.");
    window.addEventListener("offline-ready", ready);
    return () => window.removeEventListener("offline-ready", ready);
  }, []);
  const modalOpen = !!(editor || transfer || pending || help);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
        ) ?? [],
      ).filter((e) => e.getClientRects().length);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modalOpen, editor, transfer, pending, help]);
  const professional = mode === "desktop" || mode === "phone";
  const dirty =
    !!p && draft.some((e) => p.items.find((i) => i.id === e.id)?.rev !== e.rev);
  async function commit(program: Program, records = tracking) {
    setBusy(true);
    try {
      if (mode !== "desktop") {
        await saveLocal(
          { program, tracking: records },
          p ? { program: p, tracking } : null,
        );
        setStored(program);
        setSavedTracking(records);
      }
      setP(program);
      setDraft(structuredClone(program.items));
      setTracking(records);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.startsWith("Un autre onglet")
          ? error.message
          : "Enregistrement impossible : stockage indisponible ou plein. Exportez votre programme avant de fermer.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function enter(m: Mode) {
    setMode(m);
    setTab("exercises");
    setMessage("");
    setLastBatch(null);
    const program = m === "desktop" ? null : stored;
    setP(program);
    setDraft(program ? structuredClone(program.items) : []);
    setTracking(m === "desktop" ? [] : savedTracking);
  }
  async function action(fn: () => void | Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function leave() {
    if (dirty && !confirm("Abandonner les modifications non finalisées ?"))
      return;
    setMode(null);
    setP(null);
    setDraft([]);
    setAuthor("");
    setLastBatch(null);
    setTransfer(null);
    setPending(null);
    setEditor(null);
    setTracking([]);
    setMessage(
      "Session fermée. Les données de travail de cet écran ont été libérées.",
    );
  }
  async function finalize() {
    if (!p) return;
    const batch = makeBatch(p, draft, author || discipline);
    const next = applyBatch(p, batch);
    if (await commit(next)) {
      setLastBatch(batch);
      setMessage(
        mode === "desktop"
          ? "Lot finalisé en mémoire. Transmettez-le au téléphone du patient."
          : "Programme enregistré sur cet appareil.",
      );
    }
  }
  function receive(payload: Payload) {
    if (dirty)
      throw Error("Finalisez ou annulez le brouillon avant un import.");
    if (payload.type === "batch") {
      if (!p) throw Error("Importez d’abord le programme complet du patient.");
      inspectBatch(p, payload.batch);
    } else if (mode !== "desktop" && p)
      throw Error(
        "Un programme existe déjà : importez un lot incrémental. Pour restaurer une sauvegarde complète, exportez puis effacez le programme actuel.",
      );
    setPending(payload);
    setChoices({});
    setTransfer(null);
  }
  async function accept() {
    if (!pending) return;
    let program: Program;
    if (pending.type === "snapshot") program = pending.program;
    else {
      if (!p) return;
      program = applyBatch(p, pending.batch, choices);
    }
    if (await commit(program, pending.type === "snapshot" ? [] : tracking)) {
      setPending(null);
      setLastBatch(null);
      setMessage("Import validé. Les exercices non concernés sont conservés.");
    }
  }
  const conflicts =
    pending?.type === "batch" && p ? inspectBatch(p, pending.batch) : [];
  const items = professional ? draft : (p?.items ?? []);
  const active = items.filter(
    (e) => e.kind === "exercise" && e.status === "active",
  );
  const goals = items.filter(
    (e) => e.kind === "goal" && e.status !== "removed",
  );
  const date = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <>
      <header inert={modalOpen}>
        <button className="brand" onClick={() => setHelp(true)}>
          <span className="brand-icon">♧</span>
          <span>
            Brocéliande<small>RÉÉDUCATION</small>
          </span>
        </button>
        <div className="header-right">
          <span className="local-badge">● Données sur votre appareil</span>
          <button onClick={() => setHelp(true)}>Aide & confidentialité</button>
          {mode && <button onClick={leave}>Fermer la session</button>}
        </div>
      </header>
      <fieldset disabled={busy} className="app-fieldset" inert={modalOpen}>
        <main>
          {message && (
            <div className="toast" role="status">
              {message}
              <button
                onClick={() => setMessage("")}
                aria-label="Masquer le message"
              >
                ×
              </button>
            </div>
          )}
          {!mode ? (
            <section className="welcome">
              <span className="eyebrow">UN PAS DE PLUS VERS L’AUTONOMIE</span>
              <h1>
                Mes exercices.
                <br />
                Mes progrès.
                <br />
                <em>À mon rythme.</em>
              </h1>
              <p>
                Votre programme de rééducation vous accompagne.
                <br />
                Simplement, sur votre appareil, même sans connexion.
              </p>
              <div className="welcome-actions">
                <button
                  className="primary"
                  disabled={loading}
                  onClick={() => enter("patient")}
                >
                  Je suis patient →
                </button>
                <button onClick={() => enter("desktop")}>
                  Je suis professionnel →
                </button>
              </div>
              <div className="notice">
                Prototype de démonstration · Contenus cliniques non validés pour
                les soins réels.
              </div>
              <div className="welcome-tree" aria-hidden="true">
                ♧
              </div>
            </section>
          ) : (
            <>
              <div className="page-top">
                <div>
                  <span className="eyebrow">
                    {professional
                      ? "ESPACE PROFESSIONNEL · " +
                        (mode === "phone"
                          ? "SUR LE TÉLÉPHONE"
                          : "SESSION EN MÉMOIRE")
                      : date.toUpperCase()}
                  </span>
                  <h1>
                    {professional
                      ? "Construisons le prochain pas."
                      : "Bonjour, voici vos exercices."}
                  </h1>
                  <p>
                    {professional
                      ? "Récupérer, adapter, puis transmettre au patient."
                      : "Mes exercices, mes progrès, mon autonomie."}
                  </p>
                </div>
                {mode === "phone" ? (
                  <button
                    onClick={() => {
                      if (dirty) {
                        setMessage(
                          "Enregistrez ou annulez le brouillon avant de revenir.",
                        );
                        return;
                      }
                      setMode("patient");
                    }}
                  >
                    Terminer et revenir au mode patient
                  </button>
                ) : (
                  <span className="leaf" aria-hidden="true">
                    ♧
                  </span>
                )}
              </div>
              <div className="workspace">
                <aside className="sidebar">
                  <span className="eyebrow">MON ESPACE</span>
                  {[
                    [
                      "exercises",
                      "◈",
                      professional ? "Le programme" : "Mes exercices",
                    ],
                    ["goals", "◎", "Mes objectifs"],
                    ["progress", "↗", "Mes progrès"],
                    ["history", "≋", "Mon parcours"],
                  ].map(([id, icon, label]) => (
                    <button
                      key={id}
                      className={tab === id ? "nav active" : "nav"}
                      onClick={() => setTab(id)}
                    >
                      <span>{icon}</span>
                      {label}
                    </button>
                  ))}
                  <div className="sidebar-bottom">
                    <strong>Un programme, une équipe.</strong>
                    <p>
                      Le téléphone du patient reste la référence. Les échanges
                      sont toujours explicites.
                    </p>
                    <span>↳ Aucune synchronisation cloud</span>
                  </div>
                </aside>
                <section className="content">
                  {!p ? (
                    <div className="empty card">
                      <span className="big-symbol">♧</span>
                      <h2>
                        {professional
                          ? "Un programme à construire ensemble"
                          : "Bienvenue dans votre espace"}
                      </h2>
                      <p>
                        {professional
                          ? "Créez un programme ou importez celui que le patient vous partage."
                          : "Importez le programme transmis par votre thérapeute. Aucun compte nécessaire."}
                      </p>
                      <div className="actions">
                        {professional && (
                          <button
                            className="primary"
                            onClick={() => {
                              const program = emptyProgram();
                              setP(program);
                              setDraft([]);
                            }}
                          >
                            Créer un programme
                          </button>
                        )}
                        <button onClick={() => setTransfer("import")}>
                          Importer{" "}
                          {professional ? "ou reprendre" : "mon programme"}
                        </button>
                      </div>
                      {professional && (
                        <button
                          className="text-button"
                          onClick={() => {
                            const program = emptyProgram();
                            const demo = catalogue.slice(0, 3).map((c) => ({
                              ...blankEntity(),
                              catalogueId: c.id,
                              title: c.title,
                              discipline: c.discipline,
                              instructions: c.instructions,
                              ...c.defaults,
                              author: "Kinésithérapeute · démo",
                            }));
                            setP(program);
                            setDraft(demo);
                          }}
                        >
                          Essayer avec les 3 exercices du scénario fictif
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <section className="program-bar">
                        <div>
                          <span className="eyebrow">PROGRAMME LOCAL</span>
                          <strong>BROC-{p.id.slice(0, 8).toUpperCase()}</strong>
                          <small>
                            Révision {p.revision} · {active.length} exercices
                            actifs
                          </small>
                        </div>
                        <div className="actions">
                          <button
                            onClick={() => {
                              if (dirty) {
                                setMessage("Finalisez d’abord le brouillon.");
                                return;
                              }
                              setTransfer({
                                type: "snapshot",
                                schema: 1,
                                program: p,
                              });
                            }}
                          >
                            Partager{" "}
                            {professional
                              ? "le programme complet"
                              : "avec un thérapeute"}
                          </button>
                          <button
                            className="primary"
                            onClick={() => setTransfer("import")}
                          >
                            {professional
                              ? "Importer un transfert"
                              : "Mettre à jour mon programme"}
                          </button>
                        </div>
                      </section>
                      {professional && (
                        <section className="pro-tools">
                          <div className="form-grid">
                            <label>
                              Professionnel déclarant (facultatif)
                              <input
                                value={author}
                                maxLength={100}
                                onChange={(e) => setAuthor(e.target.value)}
                                placeholder="Nom ou identifiant local"
                              />
                            </label>
                            <label>
                              Votre discipline
                              <select
                                value={discipline}
                                onChange={(e) =>
                                  setDiscipline(
                                    e.target.value as Entity["discipline"],
                                  )
                                }
                              >
                                {disciplines.map((d) => (
                                  <option key={d}>{d}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <p className="small">
                            Identité déclarative, sans authentification. Sur
                            ordinateur, rien n’est enregistré de manière
                            persistante par l’application.
                          </p>
                          <div className="actions">
                            <button onClick={() => setEditor("new")}>
                              ＋ Ajouter un exercice ou un objectif
                            </button>
                            <button
                              disabled={!dirty}
                              className="primary"
                              onClick={() => action(finalize)}
                            >
                              Finaliser{" "}
                              {mode === "phone" ? "et enregistrer" : "le lot"}
                            </button>
                            {dirty && (
                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      "Abandonner les modifications de ce brouillon ?",
                                    )
                                  )
                                    setDraft(structuredClone(p.items));
                                }}
                              >
                                Annuler le brouillon
                              </button>
                            )}
                            {lastBatch && !dirty && (
                              <button
                                onClick={() =>
                                  setTransfer({
                                    type: "batch",
                                    schema: 1,
                                    batch: lastBatch,
                                  })
                                }
                              >
                                Transmettre le dernier lot →
                              </button>
                            )}
                          </div>
                          {dirty && (
                            <p className="draft-label">
                              ● Brouillon à finaliser · départ révision{" "}
                              {p.revision}
                            </p>
                          )}
                        </section>
                      )}
                      {tab === "exercises" && (
                        <>
                          <div className="section-heading">
                            <div>
                              <span className="eyebrow">
                                CHAQUE GESTE COMPTE
                              </span>
                              <h2>
                                {professional
                                  ? "Les exercices prescrits"
                                  : "Mon programme d’exercices"}
                              </h2>
                            </div>
                            <span className="count">
                              {active.length} actifs
                            </span>
                          </div>
                          <div
                            className="filters"
                            aria-label="Filtrer par discipline"
                          >
                            {["Tous", ...disciplines].map((d) => (
                              <button
                                key={d}
                                aria-pressed={filter === d}
                                className={filter === d ? "selected" : ""}
                                onClick={() => setFilter(d)}
                              >
                                {d === "Activité physique adaptée" ? "APA" : d}
                              </button>
                            ))}
                          </div>
                          <div className="exercise-grid">
                            {items
                              .filter(
                                (e) =>
                                  e.kind === "exercise" &&
                                  (professional || e.status !== "removed") &&
                                  (filter === "Tous" ||
                                    filter === e.discipline),
                              )
                              .map((e, i) => {
                                const c = catalogue.find(
                                  (c) => c.id === e.catalogueId,
                                );
                                return (
                                  <article
                                    key={e.id}
                                    className={
                                      "exercise card " +
                                      (e.status !== "active" ? "muted" : "")
                                    }
                                  >
                                    <div className="exercise-art">
                                      <span>
                                        {e.discipline === "Kinésithérapie"
                                          ? "↗"
                                          : e.discipline === "Ergothérapie"
                                            ? "⌁"
                                            : "◎"}
                                      </span>
                                      <small>
                                        {String(i + 1).padStart(2, "0")}
                                      </small>
                                    </div>
                                    <div className="exercise-body">
                                      <span
                                        className={
                                          "tag d" +
                                          disciplines.indexOf(e.discipline)
                                        }
                                      >
                                        {e.discipline}
                                      </span>
                                      <h3>{e.title}</h3>
                                      <p className="dosage">
                                        {e.series} séries ·{" "}
                                        {e.reps > 0
                                          ? `${e.reps} répétitions`
                                          : `${e.minutes} minutes`}
                                      </p>
                                      {e.reps > 0 && e.minutes > 0 && (
                                        <p>Durée : {e.minutes} min</p>
                                      )}
                                      <p className="small">
                                        {e.frequency} · Repos {e.rest} s
                                      </p>
                                      {e.status !== "active" && (
                                        <strong>
                                          {e.status === "inactive"
                                            ? "Désactivé"
                                            : "Retiré"}
                                        </strong>
                                      )}
                                      <p>{e.instructions}</p>
                                      {e.adaptations && (
                                        <p>Adaptations : {e.adaptations}</p>
                                      )}
                                      <details>
                                        <summary>
                                          Consignes & précautions
                                        </summary>
                                        <p>
                                          {c?.description ??
                                            "Exercice individualisé."}
                                        </p>
                                        <p>
                                          {c?.precautions ??
                                            "Suivre la démonstration et les précautions de votre thérapeute."}
                                        </p>
                                        {c && (
                                          <p>
                                            Matériel : {c.equipment} · Niveau :{" "}
                                            {c.difficulty}
                                          </p>
                                        )}
                                        <p className="small">
                                          Dernière modification :{" "}
                                          {e.author ||
                                            "Professionnel non renseigné"}{" "}
                                          ·{" "}
                                          {new Date(e.modified).toLocaleString(
                                            "fr-FR",
                                          )}
                                        </p>
                                      </details>
                                      {professional ? (
                                        <button
                                          className="wide"
                                          onClick={() => setEditor(e)}
                                        >
                                          Adapter / désactiver
                                        </button>
                                      ) : (
                                        e.status === "active" && (
                                          <label className="tracking">
                                            Aujourd’hui
                                            <select
                                              value={
                                                tracking
                                                  .filter(
                                                    (t) =>
                                                      t.id === e.id &&
                                                      t.date.slice(0, 10) ===
                                                        new Date()
                                                          .toISOString()
                                                          .slice(0, 10),
                                                  )
                                                  .at(-1)?.status ?? ""
                                              }
                                              onChange={(ev) => {
                                                const status = ev.target.value;
                                                if (status)
                                                  action(() =>
                                                    commit(p, [
                                                      ...tracking,
                                                      {
                                                        id: e.id,
                                                        date: now(),
                                                        status,
                                                      },
                                                    ]),
                                                  );
                                              }}
                                            >
                                              <option value="">
                                                Mon suivi (facultatif)
                                              </option>
                                              {[
                                                "Réalisé",
                                                "Non réalisé",
                                                "Difficile",
                                                "Douloureux",
                                              ].map((s) => (
                                                <option key={s}>{s}</option>
                                              ))}
                                            </select>
                                          </label>
                                        )
                                      )}
                                    </div>
                                  </article>
                                );
                              })}
                          </div>
                          {!active.length && (
                            <p className="empty">
                              Aucun exercice actif. Votre thérapeute peut en
                              ajouter.
                            </p>
                          )}
                        </>
                      )}
                      {tab === "goals" && (
                        <>
                          <h2>Les petits pas qui changent le quotidien</h2>
                          {!goals.length && (
                            <p>
                              Aucun objectif défini. Votre thérapeute peut
                              ajouter un objectif concret.
                            </p>
                          )}
                          {goals.map((e) => (
                            <article className="card goal" key={e.id}>
                              <span className="tag">{e.discipline}</span>
                              <h3>{e.title}</h3>
                              <p>{e.instructions}</p>
                              <progress max={100} value={e.progress} />
                              <p>
                                {e.progress} % ·{" "}
                                {e.status === "active"
                                  ? "En cours"
                                  : "En pause"}
                              </p>
                              {professional && (
                                <button onClick={() => setEditor(e)}>
                                  Modifier cet objectif
                                </button>
                              )}
                            </article>
                          ))}
                        </>
                      )}
                      {tab === "progress" && (
                        <>
                          <h2>Mes progrès, sans pression</h2>
                          <p>
                            Le suivi est facultatif. Il ne modifie jamais votre
                            prescription.
                          </p>
                          {tracking.length === 0 ? (
                            <div className="card empty">
                              Vos réalisations apparaîtront ici.
                            </div>
                          ) : (
                            <ul className="timeline">
                              {tracking
                                .slice()
                                .reverse()
                                .map((t, i) => (
                                  <li key={i}>
                                    <strong>
                                      {p.items.find((e) => e.id === t.id)
                                        ?.title ?? "Exercice"}
                                    </strong>
                                    <p>
                                      {t.status} ·{" "}
                                      {new Date(t.date).toLocaleString("fr-FR")}
                                    </p>
                                  </li>
                                ))}
                            </ul>
                          )}
                          <p className="small">
                            Ce suivi reste sur le téléphone et n’est pas inclus
                            dans les transferts de prescriptions.
                          </p>
                        </>
                      )}
                      {tab === "history" && (
                        <>
                          <div className="section-heading">
                            <h2>Mon parcours & mes changements</h2>
                            <button
                              disabled={dirty || !p.history.length}
                              onClick={() =>
                                action(async () => {
                                  if (
                                    confirm(
                                      "Annuler le dernier import ou changement accepté ? Les éléments ajoutés seront marqués retirés.",
                                    )
                                  )
                                    await commit(undoLast(p));
                                })
                              }
                            >
                              Annuler le dernier changement
                            </button>
                          </div>
                          <ul className="timeline">
                            {p.history
                              .slice()
                              .reverse()
                              .map((h) => (
                                <li key={h.batch.id}>
                                  <strong>
                                    {h.batch.author ||
                                      "Professionnel non renseigné"}
                                  </strong>
                                  <p>
                                    {new Date(h.at).toLocaleString("fr-FR")} ·
                                    départ révision {h.batch.baseRevision} ·{" "}
                                    {h.accepted.length} changements acceptés
                                  </p>
                                  {h.batch.ops
                                    .filter((o) => h.accepted.includes(o.id))
                                    .map((o) => (
                                      <details key={o.id}>
                                        <summary>
                                          {o.after.title} ·{" "}
                                          {o.before ? "Modification" : "Ajout"}
                                        </summary>
                                        <p>
                                          Avant :{" "}
                                          {o.before
                                            ? `${o.before.series} × ${o.before.reps} / ${o.before.minutes} min · ${o.before.status} · ${o.before.instructions}`
                                            : "Absent"}
                                        </p>
                                        <p>
                                          Après : {o.after.series} ×{" "}
                                          {o.after.reps} / {o.after.minutes} min
                                          · {o.after.status} ·{" "}
                                          {o.after.instructions}
                                        </p>
                                      </details>
                                    ))}
                                </li>
                              ))}
                          </ul>
                          {!p.history.length && (
                            <p>Aucun changement enregistré.</p>
                          )}
                        </>
                      )}
                      {!professional && (
                        <section className="phone-tools">
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  "Avec l’accord du patient : ouvrir le mode professionnel sur ce téléphone ?",
                                )
                              ) {
                                setMode("phone");
                                setDraft(structuredClone(p.items));
                              }
                            }}
                          >
                            Accès professionnel sur ce téléphone
                          </button>
                          <button
                            className="danger"
                            onClick={() =>
                              action(async () => {
                                if (
                                  confirm(
                                    "Effacer définitivement le programme, son historique et le suivi sur cet appareil ? Exportez une sauvegarde avant de continuer.",
                                  )
                                ) {
                                  await saveLocal(null, {
                                    program: p,
                                    tracking,
                                  });
                                  setStored(null);
                                  setP(null);
                                  setDraft([]);
                                  setTracking([]);
                                }
                              })
                            }
                          >
                            Effacer mes données locales
                          </button>
                        </section>
                      )}
                    </>
                  )}
                </section>
              </div>
              <footer>
                <span>♧ Brocéliande Rééducation</span>
                <span>
                  Prototype · Démonstration clinique non validée · Sans serveur
                  de dossiers patients
                </span>
              </footer>
            </>
          )}
        </main>
      </fieldset>
      {editor && (
        <Editor
          entity={editor === "new" ? undefined : editor}
          author={author || discipline}
          discipline={discipline}
          onClose={() => setEditor(null)}
          onSave={(e) => {
            setDraft((d) =>
              d.some((v) => v.id === e.id)
                ? d.map((v) => (v.id === e.id ? e : v))
                : [...d, e],
            );
            setEditor(null);
          }}
        />
      )}
      {transfer && (
        <Transfer
          payload={transfer === "import" ? undefined : transfer}
          onImport={receive}
          onClose={() => setTransfer(null)}
        />
      )}
      {pending && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Aperçu des modifications"
          >
            <span className="eyebrow">VÉRIFIER AVANT D’IMPORTER</span>
            <h2>
              {pending.type === "snapshot"
                ? "Reprendre un programme complet"
                : "Les changements proposés"}
            </h2>
            {pending.type === "snapshot" ? (
              <>
                <p>
                  {
                    pending.program.items.filter(
                      (e) => e.kind === "exercise" && e.status === "active",
                    ).length
                  }{" "}
                  exercices actifs · révision {pending.program.revision}
                </p>
                <ul>
                  {pending.program.items.map((e) => (
                    <li key={e.id}>
                      {e.title} · {e.series} × {e.reps} · {e.discipline}
                    </li>
                  ))}
                </ul>
                <p>
                  Sur ordinateur, ce programme devient une copie de travail en
                  mémoire.
                </p>
              </>
            ) : (
              <>
                <p>
                  {pending.batch.author || "Professionnel non renseigné"} ·
                  version de départ {pending.batch.baseRevision}
                </p>
                <ul>
                  {pending.batch.ops.map((o) => (
                    <li key={o.id}>
                      {!o.before
                        ? "Ajout"
                        : o.after.status === "removed"
                          ? "Retrait"
                          : o.after.status === "inactive"
                            ? "Désactivation"
                            : "Modification"}{" "}
                      : {o.after.title} · {o.after.series} × {o.after.reps}
                    </li>
                  ))}
                </ul>
                {conflicts.map((o) => {
                  const current = p?.items.find((e) => e.id === o.id);
                  return (
                    <div className="conflict" key={o.id}>
                      <h3>Deux versions : {o.after.title}</h3>
                      <p>
                        Un professionnel a déjà modifié cet élément. Choisissez
                        avec votre thérapeute.
                      </p>
                      <div className="conflict-versions">
                        {(
                          [
                            ["Version actuelle", current],
                            ["Version proposée", o.after],
                          ] as const
                        ).map(([label, version]) => (
                          <div key={label}>
                            <strong>{label}</strong>
                            {version ? (
                              <>
                                <p>
                                  {version.title} · {version.discipline}
                                </p>
                                <p>
                                  {version.series} séries · {version.reps}{" "}
                                  répétitions · {version.minutes} min · repos{" "}
                                  {version.rest} s
                                </p>
                                <p>
                                  {version.frequency} ·{" "}
                                  {version.status === "active"
                                    ? "Actif"
                                    : version.status === "inactive"
                                      ? "Désactivé"
                                      : "Retiré"}
                                </p>
                                <p>{version.instructions}</p>
                                <p>{version.adaptations}</p>
                                {version.kind === "goal" && (
                                  <p>Progression : {version.progress} %</p>
                                )}
                                <p className="small">
                                  {version.author ||
                                    "Professionnel non renseigné"}{" "}
                                  ·{" "}
                                  {new Date(version.modified).toLocaleString(
                                    "fr-FR",
                                  )}
                                </p>
                              </>
                            ) : (
                              <p>Élément absent.</p>
                            )}
                          </div>
                        ))}
                      </div>
                      <label>
                        Décision
                        <select
                          value={choices[o.id] ?? ""}
                          onChange={(e) =>
                            setChoices({
                              ...choices,
                              [o.id]: e.target.value as "current" | "incoming",
                            })
                          }
                        >
                          <option value="">Choisir explicitement…</option>
                          <option value="current">
                            Conserver la version actuelle
                          </option>
                          <option value="incoming">
                            Accepter la version proposée
                          </option>
                        </select>
                      </label>
                    </div>
                  );
                })}
              </>
            )}
            <p className="small">
              Vérifiez la provenance avec votre thérapeute. Le chiffrement ne
              certifie pas l’auteur.
            </p>
            <div className="actions">
              <button
                className="primary"
                disabled={busy || conflicts.some((o) => !choices[o.id])}
                onClick={() => action(accept)}
              >
                Valider les modifications
              </button>
              <button onClick={() => setPending(null)}>Annuler</button>
            </div>
          </section>
        </div>
      )}
      {help && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Aide"
          >
            <button
              className="close"
              aria-label="Fermer"
              onClick={() => setHelp(false)}
            >
              ×
            </button>
            <h2>Votre programme vous accompagne.</h2>
            <h3>Patient</h3>
            <p>
              Importez le fichier ou le QR remis par votre thérapeute et sa
              phrase secrète. Validez l’aperçu. Pour une nouvelle séance,
              partagez le programme complet actuel. Exportez régulièrement une
              sauvegarde chiffrée.
            </p>
            <h3>Professionnel</h3>
            <p>
              Importez le programme du patient, ajoutez ou adaptez les
              exercices, finalisez le lot puis transmettez le dernier lot. Le
              patient importe ce lot, jamais un remplacement silencieux. Fermez
              la session sur les postes partagés ; supprimez aussi les fichiers
              téléchargés et le presse-papiers.
            </p>
            <h3>Installer & utiliser hors ligne</h3>
            <p>
              Après une première visite en ligne : iPhone, Safari → Partager →
              Sur l’écran d’accueil. Android, menu du navigateur → Installer
              l’application. Attendez le message « Application disponible hors
              ligne ». Le mode privé et l’effacement du navigateur peuvent
              supprimer le stockage.
            </p>
            <InstallQr />
            <h3>Confidentialité</h3>
            <p>
              Pas de compte, de télémétrie ni de synchronisation. Données
              locales non chiffrées dans le navigateur : protégez le téléphone
              par son verrouillage système. Les exports sont chiffrés ; la perte
              de la phrase secrète empêche leur lecture. Les captures d’écran,
              fichiers et sauvegardes système restent sous votre contrôle.
            </p>
            <p>
              Prototype non validé cliniquement. Une analyse RGPD, HDS et
              dispositif médical reste nécessaire avant toute utilisation
              réelle. Voir les notices dans le dépôt.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (r) => {
        await navigator.serviceWorker.ready;
        if (r.active) window.dispatchEvent(new Event("offline-ready"));
      })
      .catch(() => {});
  });
