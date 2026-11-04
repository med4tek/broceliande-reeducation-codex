import { deflateSync, Inflate } from "fflate";
import { PayloadSchema, type Payload } from "./core";
const MAX = 2_000_000;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes: Uint8Array) {
  let bits = 0,
    value = 0,
    result = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function unbase32(s: string) {
  if (!/^[A-Z2-7]+$/.test(s) || s.length > 3_300_000)
    throw Error("Code invalide ou trop volumineux.");
  let bits = 0,
    value = 0;
  const result = [];
  for (const c of s) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const bytes = new Uint8Array(result);
  if (base32(bytes) !== s) throw Error("Code non canonique.");
  return bytes;
}
async function key(password: string, salt: Uint8Array) {
  if (password.length < 8)
    throw Error("Utilisez une phrase secrète d’au moins 8 caractères.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 210000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encode(payload: Payload, password: string) {
  PayloadSchema.parse(payload);
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if (raw.length > MAX) throw Error("Programme trop volumineux (limite 2 Mo).");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(password, salt),
      deflateSync(raw) as BufferSource,
    ),
  );
  const bytes = new Uint8Array(28 + encrypted.length);
  bytes.set(salt);
  bytes.set(iv, 16);
  bytes.set(encrypted, 28);
  return "BR1-" + base32(bytes);
}
export async function decode(code: string, password: string): Promise<Payload> {
  code = code.trim();
  if (!code.startsWith("BR1-"))
    throw Error("Il faut un code de transfert BR1, pas un identifiant BROC.");
  const bytes = unbase32(code.slice(4));
  if (bytes.length < 44) throw Error("Code incomplet.");
  let compressed: ArrayBuffer;
  try {
    compressed = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(16, 28) },
      await key(password, bytes.slice(0, 16)),
      bytes.slice(28),
    );
  } catch {
    throw Error("Phrase secrète incorrecte ou transfert corrompu.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const inflate = new Inflate((chunk) => {
    size += chunk.length;
    if (size > MAX) throw Error("Transfert décompressé trop volumineux.");
    chunks.push(chunk);
  });
  const input = new Uint8Array(compressed);
  for (let offset = 0; offset < input.length; offset += 128)
    inflate.push(
      input.slice(offset, offset + 128),
      offset + 128 >= input.length,
    );
  const data = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    data.set(chunk, cursor);
    cursor += chunk.length;
  }
  try {
    return PayloadSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
    );
  } catch {
    throw Error("Format de transfert inconnu ou données invalides.");
  }
}
