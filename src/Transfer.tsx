import { useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { decode, encode } from "./transfer";
import type { Payload } from "./core";
export function Transfer({
  payload,
  onImport,
  onClose,
}: {
  payload?: Payload;
  onImport?: (p: Payload) => void;
  onClose: () => void;
}) {
  const [pass, setPass] = useState(""),
    [code, setCode] = useState(""),
    [qr, setQr] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  async function run() {
    setBusy(true);
    setError("");
    try {
      if (payload) {
        const c = await encode(payload, pass);
        setCode(c);
        setDone(true);
        if (c.length <= 1800)
          setQr(
            await QRCode.toDataURL(c, {
              errorCorrectionLevel: "M",
              margin: 4,
              width: 640,
            }),
          );
      } else onImport?.(await decode(code, pass));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function read(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 3_400_000) throw Error("Fichier trop volumineux.");
      if (file.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(file);
        if (bitmap.width * bitmap.height > 25_000_000) {
          bitmap.close();
          throw Error("Image trop grande.");
        }
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(pixels.data, canvas.width, canvas.height);
        if (!result)
          throw Error(
            "QR illisible. Reprenez une photo ou utilisez le fichier de transfert.",
          );
        setCode(result.data);
      } else setCode(await file.text());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "broceliande-transfert.broc";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="overlay">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={payload ? "Partager le programme" : "Importer un transfert"}
      >
        <button className="close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
        <span className="eyebrow">TRANSFERT LOCAL · CHIFFRÉ</span>
        <h2>
          {payload
            ? "Partager en toute simplicité"
            : "Mettre à jour ou reprendre"}
        </h2>
        <p>
          {payload
            ? "Le fichier et le QR contiennent les données. Communiquez la phrase secrète séparément au destinataire."
            : "Importez le fichier, collez le code complet ou photographiez le QR du thérapeute. Aucun compte ni caméra sur ordinateur nécessaire."}
        </p>
        <label>
          Phrase secrète (8 caractères minimum)
          <input
            type="password"
            autoComplete="off"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              if (payload) {
                setDone(false);
                setCode("");
                setQr("");
              }
            }}
          />
        </label>
        {!payload && (
          <>
            <label>
              Code de transfert
              <textarea
                rows={4}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="BR1-…"
                spellCheck={false}
              />
            </label>
            <label className="file">
              Importer un fichier local
              <input
                type="file"
                accept=".broc,.txt"
                onChange={(e) => read(e.target.files?.[0])}
              />
            </label>
            <label className="file">
              Photographier ou lire un QR
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => read(e.target.files?.[0])}
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={busy || pass.length < 8 || (!payload && !code)}
          onClick={run}
        >
          {busy
            ? "Traitement local…"
            : payload
              ? "Préparer le transfert"
              : "Lire et prévisualiser"}
        </button>
        {payload && done && (
          <div className="export">
            <button onClick={download}>↓ Télécharger le fichier chiffré</button>
            {qr ? (
              <>
                <img className="qr" src={qr} alt="QR de transfert chiffré" />
                <a href={qr} download="broceliande-qr.png">
                  Enregistrer le QR
                </a>
              </>
            ) : (
              <p>
                Programme trop volumineux pour un QR unique : utilisez le
                fichier local.
              </p>
            )}
            <label>
              Code complet · {code.length.toLocaleString("fr-FR")} caractères
              <textarea
                readOnly
                rows={3}
                value={code}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                } catch {
                  setError("Sélectionnez le code puis copiez-le manuellement.");
                }
              }}
            >
              Copier le code
            </button>
          </div>
        )}
        <p className="small">
          Un identifiant BROC ne récupère aucune donnée. Ces transferts ne
          prouvent pas l’identité du prescripteur. Gardez la phrase secrète :
          sans elle, la sauvegarde est irrécupérable.
        </p>
      </section>
    </div>
  );
}
