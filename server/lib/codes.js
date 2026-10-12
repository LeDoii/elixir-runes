// Codes courts de partage : 8 caractères d'un alphabet sans ambiguïté (ni 0/O, ni 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // 31 caractères : 31^8 ≈ 8,5e11 codes
export const CODE_LENGTH = 8;

export function newCode() {
  const bytes = new Uint8Array(CODE_LENGTH * 2);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; out.length < CODE_LENGTH; i++) {
    if (i >= bytes.length) { crypto.getRandomValues(bytes); i = 0; }
    if (bytes[i] < 248) out += ALPHABET[bytes[i] % ALPHABET.length];     // 248 = 8 x 31 : pas de biais
  }
  return out;
}

/** « abcd-ef23 » → « ABCDEF23 » ; retourne null si la forme est invalide. */
export function normalizeCode(text) {
  const c = String(text || "").toUpperCase().replace(/[\s-]+/g, "");
  return new RegExp("^[" + ALPHABET + "]{" + CODE_LENGTH + "}$").test(c) ? c : null;
}

export const formatCode = (c) => c.slice(0, 4) + "-" + c.slice(4);
