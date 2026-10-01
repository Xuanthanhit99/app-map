# app-map

Foundation implementation for the Real-world State Network product.

## Locked architecture implemented first

- Composable State Model
  - TruthStatus: KNOWN / UNKNOWN / CONFLICT
  - Freshness: FRESH / AGING / STALE
  - System Availability: ONLINE / OFFLINE / DEGRADED / ERROR
  - Permission: GRANTED / LIMITED / DENIED / NOT_REQUIRED
  - Content Availability: CONTENT / EMPTY / NOT_APPLICABLE
  - Interaction Lifecycle: ACTION_REQUIRED / PENDING / ACTIONED / EXPIRED / DISMISSED
  - Loading/fetch lifecycle is separate
- Presentation Resolver with safety-first precedence and modifier behavior
- Domain resolvers for Road and Parking as first vertical slices
- Responsive layout contract
- Accessibility semantics contract
- Design tokens from the locked Calm Cartographic visual direction

## Product invariants represented in code

- Unknown != Safe
- Conflict != Danger
- Freshness modifies certainty
- Offline does not replace valid cached domain state
- Permission denial only limits capabilities that actually depend on permission
- Active experiences should degrade gracefully instead of collapsing into generic errors
- Structured state is separated from presentation

## Next implementation slices

1. Reality Home
2. Active Journey
3. Reality Sheet / adaptive inspector
4. Place Now
5. Moving-safe one-tap Contribution
6. Accessibility production pass
