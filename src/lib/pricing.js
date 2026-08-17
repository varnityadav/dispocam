// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for DispoCam event pricing.
// Imported by src/pages/index.js (host form), src/components/Landing.js
// (pricing section), and workers/worker.js (mirrored for server-side amounts).
// ─────────────────────────────────────────────────────────────────────────────

// ── Fixed bundle tiers (shown as 3 cards on the landing page) ────────────────
export const TIERS = {
  free:     { guests: 5,   shots: 5,  price: 0,    label: 'Free' },
  standard: { guests: 50,  shots: 25, price: 1799, label: 'Standard' },
  premium:  { guests: 150, shots: 25, price: 4799, label: 'Premium' },
};

export const TIER_LIST = Object.entries(TIERS).map(([id, t]) => ({ id, ...t }));

// ── Custom builder ranges ────────────────────────────────────────────────────
// Guest counts: multiples of 5 up to 70, then multiples of 25 up to 200
export const CUSTOM_GUESTS = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70,
  100, 125, 150, 175, 200,
];

// Shots per guest: selectable in the custom builder
export const CUSTOM_SHOTS = [10, 15, 20, 25, 30];

// ── Pricing interpolation for custom combos ──────────────────────────────────
// Breakpoints (guest count → price at 25 shots) from the old bulk tiers.
// Linearly interpolated for guest counts between breakpoints.
// Interpolation anchors: the free tier (5 guests → ₹0) plus the bulk breakpoints.
// Anything between anchors is linearly interpolated, so the price curve is
// monotonic — the more guests, the less each guest costs.
const BREAKPOINTS = [
  { guests: 5,   price: 0 },
  { guests: 50,  price: 1799 },
  { guests: 100, price: 3499 },
  { guests: 150, price: 4799 },
  { guests: 200, price: 5799 },
];

// The shot count the breakpoints are based on
const BASE_SHOTS = 25;

/**
 * Calculate the price for a custom guest + shot combination.
 * - Interpolates linearly between breakpoints for the guest count.
 * - Scales proportionally if the user picks a different shot count than BASE_SHOTS.
 * - Returns 0 for guest counts ≤ 5 (free tier).
 * - Returns the nearest whole rupee.
 */
export function calcCustomPrice(guests, shots) {
  if (guests <= 5) return 0;

  // Find the two breakpoints we sit between
  let low = BREAKPOINTS[0];
  let high = BREAKPOINTS[BREAKPOINTS.length - 1];

  for (let i = 0; i < BREAKPOINTS.length - 1; i++) {
    if (guests >= BREAKPOINTS[i].guests && guests <= BREAKPOINTS[i + 1].guests) {
      low = BREAKPOINTS[i];
      high = BREAKPOINTS[i + 1];
      break;
    }
  }

  // If guests > max breakpoint, extrapolate from the last two
  if (guests > high.guests) {
    low = BREAKPOINTS[BREAKPOINTS.length - 2];
    high = BREAKPOINTS[BREAKPOINTS.length - 1];
  }

  // Guests below the free anchor are always free (handled by the guard above).

  // Linear interpolation
  const guestRange = high.guests - low.guests;
  const priceRange = high.price - low.price;
  const fraction = guestRange > 0 ? (guests - low.guests) / guestRange : 0;
  let basePrice = low.price + priceRange * fraction;

  // Scale by shot count (base is 25 shots)
  basePrice = basePrice * (shots / BASE_SHOTS);

  return Math.round(basePrice);
}

/**
 * Validate a custom combo against allowed ranges.
 * Returns null if valid, or an error message string.
 */
export function validateCustom(guests, shots) {
  if (!CUSTOM_GUESTS.includes(guests)) {
    return `Guest count must be one of: ${CUSTOM_GUESTS.join(', ')}`;
  }
  if (!CUSTOM_SHOTS.includes(shots)) {
    return `Shot count must be one of: ${CUSTOM_SHOTS.join(', ')}`;
  }
  return null;
}

// ── Resolve any tier selector ('free' | 'standard' | 'premium' | 'custom') ──
// into a concrete { id, guests, shots, price, label }. For 'custom', the guest
// and shot counts are validated against the allowed ranges.
export function resolveTier(tierId, guests, shots) {
  if (tierId === 'custom') {
    const g = Number(guests);
    const s = Number(shots);
    const err = validateCustom(g, s);
    if (err) return null;
    return { id: 'custom', guests: g, shots: s, price: calcCustomPrice(g, s), label: 'Custom' };
  }
  return TIERS[tierId];
}

// ── Legacy compatibility ─────────────────────────────────────────────────────
// Some code references TIERS[selectedTier] directly — make sure the free tier
// is still keyed as 'free' and the new bundle IDs resolve.
export const LEGACY_TIER_MAP = {
  free: 'free',
  standard: 'standard',
  premium: 'premium',
  // Map old IDs to new ones for backwards compatibility in existing URLs/state
  t50: 'standard',
  t100: 'standard',
  t150: 'premium',
  t200: 'premium',
  t250: 'premium',
  t300: 'premium',
  t350: 'premium',
};
