import type { KrogerProduct } from "./krogerClient";

/**
 * Remembers which Kroger product a user picked for an ingredient, so "which kind of chicken?" is
 * answered once instead of on every order.
 *
 * **Scoped per store**, not per user alone: Kroger's catalogue, UPCs and prices are location
 * specific, so a pick made at one store is not a fact about another. The `locationId` is the
 * outer key and a remembered product is only ever applied back at the store it came from.
 *
 * **Device-local**, like every other piece of user state in this app (`mealPlanStorage`,
 * `pantryStorage`, the shopping list). That keeps this shippable with no migration in any
 * environment. The natural time to move it server-side is the backlog's household/shared-account
 * item, which already requires moving shopping + cook state online — see `docs/kroger-order-notes.md`.
 */

const KEY = "recipeApp.krogerMatches.v1";

/** What we keep per remembered pick — enough to re-render the row without re-searching. */
export type RememberedMatch = {
  upc: string;
  description?: string;
  brand?: string;
  size?: string;
  image?: string;
  price?: number;
  /** Epoch ms, for a future "forget picks older than…" sweep. Not used for logic today. */
  savedAt: number;
};

type MatchMemory = Record<string, Record<string, RememberedMatch>>;

/** Ingredient terms vary only in case/spacing between runs; the memory key shouldn't. */
function termKey(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

function read(): MatchMemory {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as MatchMemory;
  } catch {
    // Corrupt or unavailable storage degrades to "no memory", never to a broken order page.
    return {};
  }
}

function write(memory: MatchMemory): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Quota / private mode: the order still works, it just won't be remembered next time.
  }
}

/** The product previously approved for `term` at `locationId`, if any. */
export function recallMatch(
  locationId: string | null | undefined,
  term: string,
): RememberedMatch | null {
  if (!locationId) return null;
  return read()[locationId]?.[termKey(term)] ?? null;
}

/**
 * Record an approved pick. Called when the user confirms a product in the picker — an explicit
 * choice, not the search's first guess, which is what makes it safe to reapply silently later.
 */
export function rememberMatch(
  locationId: string | null | undefined,
  term: string,
  product: KrogerProduct,
): void {
  if (!locationId || !product.upc) return;
  const memory = read();
  const forStore = { ...(memory[locationId] ?? {}) };
  forStore[termKey(term)] = {
    upc: product.upc,
    ...(product.description ? { description: product.description } : {}),
    ...(product.brand ? { brand: product.brand } : {}),
    ...(product.size ? { size: product.size } : {}),
    ...(product.image ? { image: product.image } : {}),
    ...(typeof product.price === "number" ? { price: product.price } : {}),
    savedAt: Date.now(),
  };
  memory[locationId] = forStore;
  write(memory);
}

/** Drop a remembered pick so the next order falls back to the search's best match. */
export function forgetMatch(locationId: string | null | undefined, term: string): void {
  if (!locationId) return;
  const memory = read();
  const forStore = memory[locationId];
  if (!forStore?.[termKey(term)]) return;
  delete forStore[termKey(term)];
  if (Object.keys(forStore).length === 0) delete memory[locationId];
  write(memory);
}

/**
 * Rebuild a `KrogerProduct` from memory, for when the fresh search no longer returns it (Kroger's
 * relevance ranking shifts between runs). `fulfillment` / `stockLevel` are unknown from memory
 * alone — null, not fabricated.
 */
export function rememberedAsProduct(m: RememberedMatch): KrogerProduct {
  return {
    upc: m.upc,
    brand: m.brand ?? null,
    description: m.description ?? "",
    size: m.size ?? null,
    price: typeof m.price === "number" ? m.price : null,
    image: m.image ?? null,
    fulfillment: null,
    stockLevel: null,
  };
}
