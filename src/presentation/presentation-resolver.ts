import type { ComposableState, Freshness, SafetyLevel } from "../domain/state-model";

export interface Presentation {
  headline: string;
  supportingText?: string;
  tone: "neutral" | "positive" | "caution" | "danger" | "uncertainty" | "muted";
  cta?: string;
  badges: string[];
}

export interface ResolveContext {
  domainLabel: string;
  knownHeadline?: string;
  unknownHeadline?: string;
  conflictHeadline?: string;
  stalePrefix?: string;
  askCta?: string;
  retryCta?: string;
  fallbackCta?: string;
  permissionCta?: string;
}

const freshnessText: Record<Freshness, string> = {
  FRESH: "Dữ liệu mới",
  AGING: "Thông tin đang cũ dần",
  STALE: "Thông tin có thể đã thay đổi",
};

function toneFromSafety(safety: SafetyLevel): Presentation["tone"] | undefined {
  if (safety === "BLOCKED") return "danger";
  if (safety === "AVOID" || safety === "CAUTION") return "caution";
  return undefined;
}

/**
 * Precedence:
 * 1) hard safety
 * 2) current domain condition
 * 3) truth / uncertainty
 * 4) freshness
 * 5) system availability
 * 6) access / permission
 * 7) content availability
 * 8) interaction lifecycle
 *
 * Lower layers usually modify supporting copy / badges / CTA rather than replacing
 * a valid domain headline.
 */
export function resolvePresentation<TDomain>(
  state: ComposableState<TDomain>,
  ctx: ResolveContext,
): Presentation {
  const badges: string[] = [];
  const safetyTone = toneFromSafety(state.safetyLevel);

  let headline = ctx.knownHeadline ?? ctx.domainLabel;
  let tone: Presentation["tone"] = safetyTone ?? "neutral";
  let supportingText: string | undefined;
  let cta: string | undefined;

  if (state.contentAvailability === "NOT_APPLICABLE") {
    return {
      headline: "Không áp dụng",
      supportingText: `${ctx.domainLabel} không áp dụng trong ngữ cảnh này.`,
      tone: "muted",
      badges: ["NOT_APPLICABLE"],
    };
  }

  if (state.contentAvailability === "EMPTY") {
    headline = "Chưa có dữ liệu";
    supportingText = `Chưa có ${ctx.domainLabel.toLowerCase()} cho ngữ cảnh này.`;
    tone = "muted";
    badges.push("EMPTY");
  }

  if (state.truthStatus === "UNKNOWN") {
    headline = ctx.unknownHeadline ?? "Chưa rõ tình trạng";
    supportingText = "Chưa có đủ dữ liệu để xác nhận tình trạng hiện tại.";
    tone = "uncertainty";
    cta = ctx.askCta;
    badges.push("UNKNOWN");
  } else if (state.truthStatus === "CONFLICT") {
    headline = ctx.conflictHeadline ?? "Thông tin đang mâu thuẫn";
    supportingText = "Các nguồn gần đây đang cho tín hiệu khác nhau.";
    tone = safetyTone ?? "uncertainty";
    badges.push("CONFLICT");
  }

  if (state.freshness) {
    badges.push(state.freshness);
    const freshnessCopy = freshnessText[state.freshness];
    if (state.freshness === "STALE" && state.truthStatus === "KNOWN") {
      headline = `${ctx.stalePrefix ?? "Từng ghi nhận"} ${headline.toLowerCase()}`;
    }
    supportingText = supportingText
      ? `${supportingText} ${freshnessCopy}.`
      : `${freshnessCopy}.`;
  }

  if (state.systemAvailability === "OFFLINE") {
    badges.push("OFFLINE");
    supportingText = supportingText
      ? `${supportingText} Đang xem dữ liệu đã lưu.`
      : "Đang xem dữ liệu đã lưu.";
    cta ??= ctx.fallbackCta;
  } else if (state.systemAvailability === "DEGRADED") {
    badges.push("DEGRADED");
    supportingText = supportingText
      ? `${supportingText} Một số cập nhật tạm thời chậm.`
      : "Một số cập nhật tạm thời chậm.";
  } else if (state.systemAvailability === "ERROR") {
    badges.push("ERROR");
    supportingText = supportingText
      ? `${supportingText} Không thể tải dữ liệu mới.`
      : "Không thể tải dữ liệu mới.";
    cta ??= ctx.retryCta;
  }

  if (state.permission === "DENIED") {
    badges.push("PERMISSION_DENIED");
    supportingText = supportingText
      ? `${supportingText} Một số tính năng cá nhân hóa đang bị giới hạn.`
      : "Một số tính năng cá nhân hóa đang bị giới hạn.";
    cta ??= ctx.permissionCta;
  }

  if (state.interactionLifecycle === "ACTION_REQUIRED") {
    badges.push("ACTION_REQUIRED");
  } else if (state.interactionLifecycle === "EXPIRED") {
    badges.push("ACTION_EXPIRED");
    cta = undefined;
  }

  if (state.cached) badges.push("CACHED");

  return {
    headline,
    tone,
    badges,
    ...(supportingText !== undefined ? { supportingText } : {}),
    ...(cta !== undefined ? { cta } : {}),
  };
}
