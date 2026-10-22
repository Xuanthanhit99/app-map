# Native QA Evidence (G4 / G5)

**Status: BLOCKED.** Expo bundle exports are not device tests and are not counted as such.

| Check | Android | iOS | Evidence / blocker |
|---|---|---|---|
| Production JS bundle (Hermes) | PASS | PASS | `npm run export:{android,ios} -- --source-maps`: 2.95 MB each |
| Bundle contents verified (security) | PASS | PASS | `scripts/security-gate.mjs --bundle-map`: no build-tool advisories ship |
| Dynamic config (App Links, push projectId, Apple entitlement) | PASS | PASS | `npx expo config --type public` with and without env, both checked |
| Installable test build | NOT RUN | BLOCKED | Android: the manual workflow `native-qa-build.yml` (debug-signed APK) needs the QA API URL. Local Gradle/Maven is unreachable. iOS: needs an Apple team and EAS credentials |
| Login, secure storage | NOT RUN on device | NOT RUN | Code: tokens in Keychain/Keystore (`expo-secure-store`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) |
| GPS, permissions, lifecycle | NOT RUN on device | NOT RUN | Code: foreground-only, approved fix policy (skew 2 s / age 30 s / mocked never READY), unit tested |
| Route guidance | NOT RUN on device | NOT RUN | Engine unit tested; needs TomTom on QA |
| Offline states | NOT RUN on device | NOT RUN | API client maps network failure to `OFFLINE`; journey shows stale impact |
| Push notifications | NOT RUN | NOT RUN | Needs EAS projectId + FCM/APNs credentials; server dispatch tested |
| Store submission | not attempted | not attempted | Requires owner approval (constraint) |

## To unblock

- **Android:**
  1. Bring QA up.
  2. Run "Native QA build" with the QA URLs.
  3. Install the APK on a device and walk through: login, location permission, place, report, decide, journey with guidance, background/foreground, airplane mode.
- **iOS:**
  1. Provide the Apple Developer team.
  2. Configure EAS (`EAS_PROJECT_ID`, credentials).
  3. Build an internal distribution and test on a device.
- **Push:** the EAS project, FCM server key / APNs key in EAS, `PUSH_PROVIDER=expo` on the QA worker.
