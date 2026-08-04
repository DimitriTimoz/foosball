const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;
// The hosted Web Crypto runtime accepts at most 100,000 PBKDF2 iterations.
export const PASSWORD_ITERATIONS = 100_000;

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase("en");
}

export function validateUsername(value: string) {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Username must contain 3 to 30 letters, numbers, dots, dashes, or underscores.");
  }
  return username;
}

export function validatePassword(value: string) {
  if (value.length < 10 || value.length > 128) {
    throw new Error("Password must contain between 10 and 128 characters.");
  }
  return value;
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS) {
  validatePassword(password);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePassword(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, rawIterations, rawSalt, rawHash] = encoded.split("$");
  const iterations = Number(rawIterations);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1 || !rawSalt || !rawHash) return false;
  try {
    const expected = base64UrlToBytes(rawHash);
    const actual = await derivePassword(password, base64UrlToBytes(rawSalt), iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashOpaqueToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = new Uint8Array(salt).buffer;
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(first: Uint8Array, second: Uint8Array) {
  if (first.length !== second.length) return false;
  let mismatch = 0;
  for (let index = 0; index < first.length; index += 1) mismatch |= first[index] ^ second[index];
  return mismatch === 0;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
