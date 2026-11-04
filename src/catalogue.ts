import type { Entity } from "./core";
export const catalogueVersion = 1;
export type CatalogueEntry = {
  id: string;
  title: string;
  discipline: Entity["discipline"];
  categories: string[];
  pathways: string[];
  objective: string;
  description: string;
  instructions: string;
  precautions: string;
  equipment: string;
  difficulty: string;
  illustration: string;
  defaults: { series: number; reps: number; minutes: number };
};
const rows: [string, string, Entity["discipline"], string[], string, string][] =
  [
    [
      "KINE-012",
      "Flexion du genou",
      "Kinésithérapie",
      ["Prothèse totale de genou"],
      "Retrouver une flexion confortable.",
      "Assis, faire glisser doucement le pied vers soi.",
    ],
    [
      "KINE-013",
      "Renforcement du quadriceps",
      "Kinésithérapie",
      ["Prothèse totale de genou"],
      "Faciliter le maintien du genou.",
      "Contracter doucement la cuisse selon la démonstration du thérapeute.",
    ],
    [
      "KINE-014",
      "Marche",
      "Kinésithérapie",
      [
        "Prothèse totale de genou",
        "Prothèse totale de hanche",
        "Amputation du membre inférieur",
      ],
      "Se déplacer avec davantage d’autonomie.",
      "Marcher sur le trajet sécurisé choisi avec votre thérapeute.",
    ],
    [
      "ERGO-008",
      "Travail des transferts",
      "Ergothérapie",
      ["AVC", "Prothèse totale de hanche", "Amputation du membre inférieur"],
      "Se lever et s’asseoir avec confiance.",
      "Répéter le transfert montré par votre thérapeute, avec les appuis indiqués.",
    ],
    [
      "ERGO-009",
      "Habillage en autonomie",
      "Ergothérapie",
      ["AVC", "Prothèse d’épaule"],
      "Gagner en autonomie pour s’habiller.",
      "Pratiquer les étapes de l’habillage choisies avec votre thérapeute.",
    ],
    [
      "APA-034",
      "Renforcement global",
      "Activité physique adaptée",
      ["Déconditionnement", "Sclérose en plaques"],
      "Retrouver de l’aisance dans les activités.",
      "Réaliser le mouvement adapté montré par le professionnel.",
    ],
    [
      "APA-035",
      "Travail de l’équilibre",
      "Activité physique adaptée",
      ["Troubles de l’équilibre", "AVC"],
      "Améliorer la stabilité.",
      "Se placer près de l’appui stable indiqué, avec accompagnement si prescrit.",
    ],
    [
      "APA-036",
      "Endurance douce",
      "Activité physique adaptée",
      ["Réentraînement à l’effort", "Déconditionnement"],
      "Reprendre une activité régulière.",
      "Suivre la durée et l’intensité fixées avec le professionnel.",
    ],
    [
      "KINE-015",
      "Mobilité de l’épaule",
      "Kinésithérapie",
      ["Prothèse d’épaule"],
      "Faciliter les gestes quotidiens.",
      "Effectuer uniquement le mouvement et l’amplitude autorisés.",
    ],
    [
      "ERGO-010",
      "Manipulation d’objets",
      "Ergothérapie",
      ["AVC", "Sclérose en plaques"],
      "Faciliter les gestes de la main.",
      "Déplacer les objets choisis sur une table stable.",
    ],
  ];
export const catalogue: CatalogueEntry[] = rows.map(
  ([id, title, discipline, pathways, objective, instructions]) => ({
    id,
    title,
    discipline,
    pathways,
    objective,
    description: objective,
    instructions,
    categories: [id.startsWith("APA") ? "Condition physique" : "Autonomie"],
    precautions:
      "Démonstration non validée cliniquement. À adapter par un professionnel. Interrompre en cas de douleur inhabituelle, malaise ou difficulté et demander conseil.",
    equipment:
      title === "Marche"
        ? "Aide à la marche si prescrite"
        : "Appui stable si nécessaire",
    difficulty: "Adapté par le thérapeute",
    illustration: "Mouvement à montrer en séance",
    defaults: {
      series: title === "Marche" ? 2 : 3,
      reps: title === "Marche" ? 0 : 10,
      minutes: title === "Marche" ? 5 : 0,
    },
  }),
);
