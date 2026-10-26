import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { emailSchema } from "../apps/api/src/modules/identity";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const addressparser = require("nodemailer/lib/addressparser") as (value: string) => Array<{ address?: string; group?: Array<{ address?: string }> }>;

/**
 * Nodemailer addressparser through 10.1.3 mis-read three RFC 5322 forms and could
 * deliver account mail to an attacker-chosen domain. Registration stores only
 * addresses zod accepts, and the installed parser must not revive the old reading.
 */
const ATTACKS = [
  '<"a@evil.com>"@good.com>',
  "Victim (x(y) <evil@evil.com>) <v@victim.com>",
  "G: (a; <evil@evil.com>) <v@victim.com>;",
];

function addresses(value: string): string[] {
  const parsed = addressparser(value);
  return parsed.flatMap((entry) => [entry.address, ...(entry.group ?? []).map((g) => g.address)]).filter((a): a is string => Boolean(a));
}

describe("mail recipient boundary", () => {
  it("refuses the addressparser attack forms at account registration", () => {
    for (const sample of ATTACKS) expect(emailSchema.safeParse(sample).success).toBe(false);
    expect(emailSchema.parse("  User@Example.com ")).toBe("user@example.com");
  });

  it("parses the published proofs without an evil.com recipient (nodemailer >= 10.1.4)", () => {
    for (const sample of ATTACKS) {
      expect(addresses(sample).some((a) => a.toLowerCase().endsWith("@evil.com"))).toBe(false);
    }
  });
});
