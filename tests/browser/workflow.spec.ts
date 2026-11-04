import { test, expect, type Page, type Browser } from "@playwright/test";
import {
  emptyProgram,
  applyBatch,
  makeBatch,
  blankEntity,
  uid,
} from "../../src/core";
import { encode } from "../../src/transfer";
const secret = "Foret-demo-2026";
async function start(browser: Browser, role: "patient" | "professional") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("./");
  await page
    .getByRole("button", {
      name: role === "patient" ? "Je suis patient" : "Je suis professionnel",
    })
    .click();
  return page;
}
async function exportCode(page: Page, last = false) {
  await page
    .getByRole("button", {
      name: last ? "Transmettre le dernier lot" : "Partager",
      exact: false,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Phrase secrète").fill(secret);
  await dialog.getByRole("button", { name: "Préparer le transfert" }).click();
  const textarea = dialog.getByRole("textbox", { name: "Code complet" });
  await expect(textarea).toBeVisible();
  const code = await textarea.inputValue();
  // Actual file export must contain the complete ciphertext.
  const downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Télécharger le fichier chiffré" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("broceliande-transfert.broc");
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  return code;
}
async function importCode(page: Page, code: string, fromFile = false) {
  await page
    .getByRole("button", {
      name: /Importer ou reprendre|Importer mon programme|Mettre à jour mon programme|Importer un transfert/,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Phrase secrète").fill(secret);
  if (fromFile)
    await dialog.getByLabel("Importer un fichier local").setInputFiles({
      name: "programme.broc",
      mimeType: "text/plain",
      buffer: Buffer.from(code),
    });
  else await dialog.getByLabel("Code de transfert", { exact: true }).fill(code);
  await dialog.getByRole("button", { name: "Lire et prévisualiser" }).click();
  await page
    .getByRole("button", { name: "Valider les modifications", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function add(page: Page, id: string) {
  await page
    .getByRole("button", { name: "Ajouter un exercice ou un objectif" })
    .click();
  await page.getByLabel("Bibliothèque de démonstration").selectOption(id);
  await page
    .getByRole("button", { name: "Enregistrer dans le brouillon" })
    .click();
}
async function finalize(page: Page) {
  await page
    .getByRole("button", { name: "Finaliser le lot", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Transmettre le dernier lot" }),
  ).toBeVisible();
}
test("trois ordinateurs sans caméra → téléphone, puis révision, persistance et hors ligne", async ({
  browser,
}) => {
  const kine = await start(browser, "professional");
  const external: string[] = [];
  kine.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4173")) external.push(r.url());
  });
  await kine
    .getByRole("button", { name: "Essayer avec les 3 exercices" })
    .click();
  await finalize(kine);
  const patient = await start(browser, "patient");
  await importCode(patient, await exportCode(kine), true);
  await expect(patient.locator(".exercise")).toHaveCount(3);
  const ergo = await start(browser, "professional");
  await importCode(ergo, await exportCode(patient));
  await expect(ergo.locator(".exercise")).toHaveCount(3);
  await ergo.getByLabel("Votre discipline").selectOption("Ergothérapie");
  await add(ergo, "ERGO-008");
  await add(ergo, "ERGO-009");
  await finalize(ergo);
  await importCode(patient, await exportCode(ergo, true));
  await expect(patient.locator(".exercise")).toHaveCount(5);
  const apa = await start(browser, "professional");
  await importCode(apa, await exportCode(patient));
  await apa
    .getByLabel("Votre discipline")
    .selectOption("Activité physique adaptée");
  await add(apa, "APA-034");
  await add(apa, "APA-035");
  await finalize(apa);
  await importCode(patient, await exportCode(apa, true));
  await expect(patient.locator(".exercise")).toHaveCount(7);
  await importCode(kine, await exportCode(patient));
  await kine
    .locator(".exercise")
    .filter({
      has: kine.getByRole("heading", { name: "Flexion du genou", exact: true }),
    })
    .getByRole("button", { name: "Adapter / désactiver" })
    .click();
  await kine.getByLabel("Répétitions", { exact: true }).fill("15");
  await kine
    .getByRole("button", { name: "Enregistrer dans le brouillon" })
    .click();
  await kine
    .locator(".exercise")
    .filter({ has: kine.getByRole("heading", { name: "Marche", exact: true }) })
    .getByRole("button", { name: "Adapter / désactiver" })
    .click();
  await kine
    .getByRole("combobox", { name: "État", exact: true })
    .selectOption("inactive");
  await kine
    .getByRole("button", { name: "Enregistrer dans le brouillon" })
    .click();
  await finalize(kine);
  const batch = await exportCode(kine, true);
  await importCode(patient, batch);
  await expect(patient.locator(".exercise")).toHaveCount(7);
  await expect(patient.locator(".exercise").first()).toContainText(
    "15 répétitions",
  );
  await expect(
    patient.locator(".exercise").filter({
      has: patient.getByRole("heading", { name: "Marche", exact: true }),
    }),
  ).toContainText("Désactivé");
  await patient
    .locator(".exercise")
    .first()
    .getByLabel("Aujourd’hui")
    .selectOption("Réalisé");
  const backup = await exportCode(patient);
  const restored = await start(browser, "patient");
  await importCode(restored, backup, true);
  await expect(restored.locator(".exercise")).toHaveCount(7);
  await patient.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await patient.context().setOffline(true);
  await patient.reload();
  await patient.screenshot({
    path: "test-results/offline-reload.png",
    fullPage: true,
  });

  await patient.getByRole("button", { name: "Je suis patient" }).click();
  await expect(patient.locator(".exercise")).toHaveCount(7);
  await expect(
    patient.locator(".exercise").first().getByLabel("Aujourd’hui"),
  ).toHaveValue("Réalisé");
  await patient
    .getByRole("button", { name: "Mon parcours", exact: false })
    .click();
  await expect(patient.locator(".timeline>li")).toHaveCount(4);
  expect(external).toEqual([]);
  // Shared desktop reload loses program session; patient storage remains local to its context.
  await ergo.reload();
  await ergo.getByRole("button", { name: "Je suis professionnel" }).click();
  await expect(
    ergo.getByRole("button", { name: "Créer un programme", exact: true }),
  ).toBeVisible();
  await patient.screenshot({
    path: "test-results/patient-mobile.png",
    fullPage: true,
  });
});
test("QR réel généré puis importé depuis une image et protection contre le faux code court", async ({
  browser,
}) => {
  const pc = await start(browser, "professional");
  await pc
    .getByRole("button", { name: "Créer un programme", exact: true })
    .click();
  await pc
    .getByRole("button", { name: "Partager le programme complet" })
    .click();
  await pc.getByLabel("Phrase secrète").fill(secret);
  await pc.getByRole("button", { name: "Préparer le transfert" }).click();
  const image = pc.getByAltText("QR de transfert chiffré");
  await expect(image).toBeVisible();
  const src = await image.getAttribute("src");
  const patient = await start(browser, "patient");
  await patient.getByRole("button", { name: "Importer mon programme" }).click();
  await patient.getByLabel("Phrase secrète").fill(secret);
  await patient
    .getByLabel("Code de transfert", { exact: true })
    .fill("BROC-FAUX");
  await patient.getByRole("button", { name: "Lire et prévisualiser" }).click();
  await expect(patient.getByRole("alert")).toContainText(
    "pas un identifiant BROC",
  );
  await patient.getByLabel("Photographier ou lire un QR").setInputFiles({
    name: "qr.png",
    mimeType: "image/png",
    buffer: Buffer.from(src!.split(",")[1], "base64"),
  });
  await patient.getByRole("button", { name: "Lire et prévisualiser" }).click();
  await patient
    .getByRole("button", { name: "Valider les modifications", exact: true })
    .click();
  await expect(patient.locator(".program-bar")).toContainText("Révision 0");
});
test("téléphone : édition directe, objectif, suppression locale et interface mobile", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  await p.goto("./");
  await p.getByRole("button", { name: "Je suis patient" }).click();
  await importCode(
    p,
    await encode(
      { type: "snapshot", schema: 1, program: emptyProgram() },
      secret,
    ),
  );
  p.on("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Accès professionnel" }).click();
  await add(p, "KINE-012");
  await p
    .getByRole("button", { name: "Ajouter un exercice ou un objectif" })
    .click();
  await p
    .getByRole("combobox", { name: "Type", exact: true })
    .selectOption("goal");
  await p.getByLabel("Mon objectif concret").fill("Marcher 100 mètres");
  await p
    .getByRole("button", { name: "Enregistrer dans le brouillon" })
    .click();
  await p.getByRole("button", { name: "Finaliser et enregistrer" }).click();
  await p
    .getByRole("button", { name: "Terminer et revenir au mode patient" })
    .click();
  await expect(p.locator(".exercise")).toHaveCount(1);
  await p.getByRole("button", { name: "Mes objectifs", exact: false }).click();
  await expect(
    p.getByRole("heading", { name: "Marcher 100 mètres" }),
  ).toBeVisible();
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await p.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await p.getByRole("button", { name: "Effacer mes données locales" }).click();
  await expect(
    p.getByRole("button", { name: "Importer mon programme" }),
  ).toBeVisible();
  await p.reload();
  await p.getByRole("button", { name: "Je suis patient" }).click();
  await expect(
    p.getByRole("button", { name: "Importer mon programme" }),
  ).toBeVisible();
});

test("conflit visible : choix explicite, anti-rejeu et annulation", async ({
  browser,
}) => {
  let base = emptyProgram();
  base = applyBatch(
    base,
    makeBatch(
      base,
      [{ ...blankEntity(), title: "Flexion test" }],
      "Kinésithérapeute",
    ),
  );
  const a = makeBatch(
    base,
    [{ ...base.items[0], rev: uid(), reps: 15 }],
    "Professionnel A",
  );
  const b = makeBatch(
    base,
    [{ ...base.items[0], rev: uid(), reps: 20 }],
    "Professionnel B",
  );
  const page = await start(browser, "patient");
  await importCode(
    page,
    await encode({ schema: 1, type: "snapshot", program: base }, secret),
  );
  await importCode(
    page,
    await encode({ schema: 1, type: "batch", batch: a }, secret),
  );
  const ciphertext = await encode(
    { schema: 1, type: "batch", batch: b },
    secret,
  );
  await page
    .getByRole("button", { name: "Mettre à jour mon programme" })
    .click();
  await page.getByLabel("Phrase secrète").fill(secret);
  await page.getByLabel("Code de transfert", { exact: true }).fill(ciphertext);
  await page.getByRole("button", { name: "Lire et prévisualiser" }).click();
  await expect(
    page.getByRole("button", {
      name: "Valider les modifications",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator(".conflict")).toContainText("Deux versions");
  await page
    .getByRole("combobox", { name: "Décision" })
    .selectOption("incoming");
  await page
    .getByRole("button", { name: "Valider les modifications", exact: true })
    .click();
  await expect(page.locator(".exercise")).toContainText("20 répétitions");
  await page
    .getByRole("button", { name: "Mettre à jour mon programme" })
    .click();
  await page.getByLabel("Phrase secrète").fill(secret);
  await page.getByLabel("Code de transfert", { exact: true }).fill(ciphertext);
  await page.getByRole("button", { name: "Lire et prévisualiser" }).click();
  await expect(page.getByRole("alert")).toContainText("déjà");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Mon parcours", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Annuler le dernier changement" })
    .click();
  await page
    .getByRole("button", { name: "Mes exercices", exact: false })
    .click();
  await expect(page.locator(".exercise")).toContainText("15 répétitions");
});

test("deux onglets patient ne peuvent pas écraser leurs changements locaux", async ({
  browser,
}) => {
  let program = emptyProgram();
  program = applyBatch(
    program,
    makeBatch(program, [{ ...blankEntity(), title: "Exercice local" }], "Démo"),
  );
  const first = await start(browser, "patient");
  await importCode(
    first,
    await encode({ schema: 1, type: "snapshot", program }, secret),
  );
  const second = await first.context().newPage();
  await second.goto("./");
  await second.getByRole("button", { name: "Je suis patient" }).click();
  await first
    .locator(".exercise")
    .getByLabel("Aujourd’hui")
    .selectOption("Réalisé");
  await second
    .locator(".exercise")
    .getByLabel("Aujourd’hui")
    .selectOption("Difficile");
  await expect(second.getByRole("status")).toContainText("Un autre onglet");
  await second.reload();
  await second.getByRole("button", { name: "Je suis patient" }).click();
  await expect(
    second.locator(".exercise").getByLabel("Aujourd’hui"),
  ).toHaveValue("Réalisé");
});

test("installation : manifeste, QR et cache utilisent le chemin du site", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("./");
  const base = new URL(page.url());
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .evaluate((link: HTMLLinkElement) => link.href);
  expect(new URL(manifestUrl).pathname).toBe(
    base.pathname + "manifest.webmanifest",
  );
  const response = await page.request.get(manifestUrl);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(new URL(manifest.start_url, manifestUrl).href).toBe(base.href);
  expect(new URL(manifest.scope, manifestUrl).href).toBe(base.href);
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, manifestUrl);
    expect(url.pathname.startsWith(base.pathname)).toBe(true);
    expect((await page.request.get(url.href)).ok()).toBe(true);
  }
  await page.getByRole("button", { name: "Aide & confidentialité" }).click();
  const qr = page.getByAltText(
    "QR d’installation de l’application, sans données patient",
  );
  await expect(qr).toBeVisible();
  const pixels = await qr.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      ),
    };
  });
  const { default: jsQR } = await import("jsqr");
  expect(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data,
  ).toBe(base.href);
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(scope).toBe(base.href);
  const cacheUrls = await page.evaluate(async () => {
    const all = [];
    for (const key of await caches.keys()) {
      for (const request of await (await caches.open(key)).keys())
        all.push(request.url);
    }
    return all;
  });
  expect(cacheUrls.some((url) => url === base.href)).toBe(true);
  expect(
    cacheUrls.every((url) => new URL(url).pathname.startsWith(base.pathname)),
  ).toBe(true);
});
