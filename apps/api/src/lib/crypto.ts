import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}
export function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Always spend comparable work so absent accounts are not distinguishable by timing.
  const parts = stored?.split("$") ?? [];
  const valid = parts.length === 6 && parts[0] === "scrypt";
  const N = valid ? Number(parts[1]) : SCRYPT.N, r = valid ? Number(parts[2]) : SCRYPT.r, p = valid ? Number(parts[3]) : SCRYPT.p;
  const salt = valid ? Buffer.from(parts[4]!, "base64url") : randomBytes(16);
  const expected = valid ? Buffer.from(parts[5]!, "base64url") : randomBytes(64);
  if (![16384, 32768, 65536].includes(N) || r !== 8 || p !== 1) return false;
  const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, { N, r, p, maxmem: SCRYPT.maxmem });
  return valid && actual.length === expected.length && timingSafeEqual(actual, expected);
}

const COMMON = new Set(["password123", "1234567890", "qwertyuiop", "12345678910", "matkhau123", "password1234", "abc1234567", "iloveyou12", "0123456789", "admin12345"]);
export function passwordProblems(password: string, email: string): string[] {
  const problems: string[] = [];
  if (password.length < 10) problems.push("TOO_SHORT");
  if (password.length > 200) problems.push("TOO_LONG");
  if (COMMON.has(password.toLowerCase())) problems.push("TOO_COMMON");
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) problems.push("CONTAINS_EMAIL");
  if (new Set(password).size < 5) problems.push("TOO_REPETITIVE");
  return problems;
}
