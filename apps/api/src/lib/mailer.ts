import nodemailer, { type Transporter } from "nodemailer";
import type { AppConfig } from "../config";

export type MailMessage = { to: string; subject: string; text: string; html?: string; tag: string };

/** Outbound mail. `available` is what the product shows the user: never claim an email was sent when it cannot be. */
export interface Mailer {
  readonly available: boolean;
  readonly transport: AppConfig["mail"]["transport"];
  send(message: MailMessage): Promise<void>;
}

export class MailDeliveryError extends Error { constructor(m: string) { super(m); this.name = "MailDeliveryError"; } }

/** Development/test capture. Refused by config in qa/production. */
export class OutboxMailer implements Mailer {
  readonly available = true;
  readonly transport = "outbox" as const;
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) { this.sent.push(message); }
}

export class UnavailableMailer implements Mailer {
  readonly available = false;
  readonly transport = "none" as const;
  async send(): Promise<void> { throw new MailDeliveryError("EMAIL_DELIVERY_UNAVAILABLE"); }
}

export class SmtpMailer implements Mailer {
  readonly available = true;
  readonly transport = "smtp" as const;
  private readonly t: Transporter;
  constructor(private readonly config: AppConfig["mail"]) {
    const u = new URL(config.smtpUrl!);
    const secure = u.protocol === "smtps:";
    this.t = nodemailer.createTransport({
      host: u.hostname.replace(/^\[|\]$/g, ""),
      port: Number(u.port || (secure ? 465 : 587)),
      secure,
      requireTLS: config.requireTls,
      ...(u.username ? { auth: { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } } : {}),
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    });
  }
  async send(message: MailMessage) {
    try {
      await this.t.sendMail({ from: this.config.from, to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}), headers: { "X-Reality-Tag": message.tag } });
    } catch (e) {
      // Never log the recipient or body: only the failure class.
      throw new MailDeliveryError(`SMTP_SEND_FAILED:${(e as { code?: string }).code ?? "UNKNOWN"}`);
    }
  }
}

export function createMailer(config: AppConfig): Mailer {
  if (config.mail.transport === "smtp") return new SmtpMailer(config.mail);
  if (config.mail.transport === "outbox") return new OutboxMailer();
  return new UnavailableMailer();
}
