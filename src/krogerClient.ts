import { dataFileUrl } from "./loadRecipes";

/**
 * Client for the /api/kroger/* endpoints.
 *
 * Reminder on what Kroger's public API can do: these endpoints let a user link
 * their Kroger account and push items into their Kroger cart. Kroger does not
 * expose a "place order" / checkout API — the user completes checkout on Kroger.
 */

export type KrogerStatus = {
  /** Server has KROGER_* credentials configured. */
  configured: boolean;
  /** This user has linked a Kroger account. */
  connected: boolean;
  locationId: string | null;
  locationName: string | null;
  /** Kroger banner code for the selected store (e.g. "RALPHS", "KROGER"). */
  locationChain: string | null;
};

export type KrogerLocation = {
  locationId: string;
  name: string;
  chain: string | null;
  address: { line1: string; city: string; state: string; zip: string } | null;
};

export type KrogerFulfillment = {
  curbside?: boolean;
  delivery?: boolean;
  inStore?: boolean;
  shipToHome?: boolean;
};

export type KrogerProduct = {
  upc: string;
  brand: string | null;
  description: string;
  size: string | null;
  price: number | null;
  image: string | null;
  fulfillment: KrogerFulfillment | null;
  stockLevel: string | null;
};

export type KrogerMatch = {
  key: string;
  term: string;
  best: KrogerProduct | null;
  alternates: KrogerProduct[];
  error?: number;
};

export class KrogerApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "KrogerApiError";
    this.status = status;
    this.code = code;
  }
}

type ErrBody = { error?: string; message?: string };

async function readError(res: Response): Promise<KrogerApiError> {
  const body = (await res.json().catch(() => ({}))) as ErrBody;
  return new KrogerApiError(
    body.message || body.error || `Request failed (${res.status})`,
    res.status,
    body.error,
  );
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(dataFileUrl(path));
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(dataFileUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

/** Full-page navigation target that kicks off the OAuth connect flow. */
export function krogerAuthorizeUrl(user: string): string {
  return dataFileUrl(`/api/kroger/authorize?user=${encodeURIComponent(user)}`);
}

export function getKrogerStatus(user: string): Promise<KrogerStatus> {
  return getJson(`/api/kroger/status?user=${encodeURIComponent(user)}`);
}

export function getKrogerLocations(zip: string): Promise<{ locations: KrogerLocation[] }> {
  return getJson(`/api/kroger/locations?zip=${encodeURIComponent(zip)}`);
}

export function setKrogerStore(
  user: string,
  locationId: string,
  locationName: string,
  chain: string | null,
): Promise<{ ok: boolean }> {
  return postJson(`/api/kroger/store`, { user, locationId, locationName, chain });
}

export type MatchItemInput = { key: string; name: string };

export function matchKrogerProducts(
  user: string,
  items: MatchItemInput[],
): Promise<{ locationId: string; matches: KrogerMatch[] }> {
  return postJson(`/api/kroger/match`, { user, items });
}

export type CartItemInput = { upc: string; quantity: number };

export function krogerCartAdd(
  user: string,
  items: CartItemInput[],
  modality = "PICKUP",
): Promise<{ ok: boolean; count: number }> {
  return postJson(`/api/kroger/cart-add`, { user, items, modality });
}

/**
 * Kroger operates many banners that share one account/cart, but each has its own
 * storefront where checkout actually happens (Kroger has no checkout API). Map the
 * store's `chain` code to the right storefront so we send the user to the correct
 * cart — e.g. a Ralphs (SoCal) shopper must check out on ralphs.com, not kroger.com.
 * Best-effort list; unknown banners fall back to Kroger.
 */
const KROGER_BANNERS: Record<string, { label: string; host: string }> = {
  KROGER: { label: "Kroger", host: "www.kroger.com" },
  RALPHS: { label: "Ralphs", host: "www.ralphs.com" },
  HARRISTEETER: { label: "Harris Teeter", host: "www.harristeeter.com" },
  FREDMEYER: { label: "Fred Meyer", host: "www.fredmeyer.com" },
  KINGSOOPERS: { label: "King Soopers", host: "www.kingsoopers.com" },
  FRYS: { label: "Fry's", host: "www.frysfood.com" },
  SMITHS: { label: "Smith's", host: "www.smithsfoodanddrug.com" },
  QFC: { label: "QFC", host: "www.qfc.com" },
  DILLONS: { label: "Dillons", host: "www.dillons.com" },
  FOOD4LESS: { label: "Food 4 Less", host: "www.food4less.com" },
  FOODSCO: { label: "Foods Co", host: "www.foodsco.net" },
  MARIANOS: { label: "Mariano's", host: "www.marianos.com" },
  PICKNSAVE: { label: "Pick 'n Save", host: "www.picknsave.com" },
  METROMARKET: { label: "Metro Market", host: "www.metromarket.net" },
  BAKERS: { label: "Baker's", host: "www.bakersplus.com" },
  CITYMARKET: { label: "City Market", host: "www.citymarket.com" },
  GERBES: { label: "Gerbes", host: "www.gerbes.com" },
  JAYC: { label: "Jay C", host: "www.jaycfoods.com" },
  PAYLESS: { label: "Pay-Less", host: "www.pay-less.com" },
  OWENS: { label: "Owen's", host: "www.owensmarket.com" },
};

function normChain(chain: string | null | undefined): string {
  return String(chain || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Resolve a banner's display label + storefront host (falls back to Kroger). */
export function krogerBanner(chain: string | null | undefined): { label: string; host: string } {
  return KROGER_BANNERS[normChain(chain)] ?? KROGER_BANNERS.KROGER;
}

/** Checkout/cart URL for the store's banner. */
export function krogerCartUrl(chain: string | null | undefined): string {
  return `https://${krogerBanner(chain).host}/cart`;
}
