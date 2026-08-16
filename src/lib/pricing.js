// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for DispoCam event pricing.
// Imported by src/pages/index.js (host form) and src/components/Landing.js
// (pricing section) so prices can never drift between the two UIs.
//
// ⚠️ workers/worker.js keeps a MIRRORED copy for server-side order amounts and
// capacity enforcement (it deploys as its own unit and can't import from src).
// When prices change, update that copy too — the comment there says the same.
// ─────────────────────────────────────────────────────────────────────────────

export const TIERS = {
  free: { guests: 5, shots: 5, price: 0 },
  t50: { guests: 50, shots: 25, price: 1799 },
  t100: { guests: 100, shots: 25, price: 3499 },
  t150: { guests: 150, shots: 25, price: 4799 },
  t200: { guests: 200, shots: 25, price: 5799 },
  t250: { guests: 250, shots: 25, price: 6899 },
  t300: { guests: 300, shots: 25, price: 7999 },
  t350: { guests: 350, shots: 25, price: 8999 },
};

export const TIER_LIST = Object.entries(TIERS).map(([id, t]) => ({ id, ...t }));
