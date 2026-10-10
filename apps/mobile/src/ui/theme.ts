import { tokens } from "../../../../src/theme/tokens";

export const theme = {
  ...tokens,
  typography: {
    display: { fontSize: 32, lineHeight: 38, fontWeight: "700" as const },
    title1: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const },
    title2: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
    headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
    body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
    small: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
    label: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const },
  },
} as const;
