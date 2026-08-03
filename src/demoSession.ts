/**
 * One-click demo entry for the link on Jordan's resume.
 *
 * A recruiter following that link should land in a working app, not a signup form. Adding
 * `?demo=1` to the URL provisions a throwaway account and signs them straight in.
 *
 * Each visitor gets their *own* account rather than a single shared `demo` login: the recipe
 * library is public, so a fresh account already sees every recipe, while a shared account would
 * let one visitor's edits, meal plan and shopping list greet the next one.
 */

import { loadRecipeBundle } from "./loadRecipes";
import { loadMealPlan, saveMealPlan } from "./mealPlanStorage";
import { buildStarterPlan, starterSavedRecipeIds } from "./starterPlan";
import type { Recipe } from "./types";

/** Add `?demo=1` to the app URL (before or inside the hash) to trigger provisioning. */
export const DEMO_QUERY = "demo";

const DEMO_USER_PREFIX = "demo-";

/** Demo accounts are recognisable by username alone — no extra column on `Owners`. */
export function isDemoUser(username: string | null | undefined): boolean {
  return typeof username === "string" && username.startsWith(DEMO_USER_PREFIX);
}

/**
 * True when the current URL asks for a demo session. The app is a HashRouter, so the param can
 * arrive either before the hash (`/?demo=1`, the tidy form for a resume) or inside it
 * (`/#/recipes?demo=1`, what you get from sharing an in-app URL).
 */
export function demoRequested(loc: { search: string; hash: string } = window.location): boolean {
  if (new URLSearchParams(loc.search).get(DEMO_QUERY) != null) {
    return true;
  }
  const q = loc.hash.indexOf("?");
  return q >= 0 && new URLSearchParams(loc.hash.slice(q + 1)).get(DEMO_QUERY) != null;
}

/** Drop `demo` from the URL so a later reload or sign-out doesn't provision a second account. */
export function stripDemoParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete(DEMO_QUERY);
  const q = url.hash.indexOf("?");
  if (q >= 0) {
    const params = new URLSearchParams(url.hash.slice(q + 1));
    params.delete(DEMO_QUERY);
    const rest = params.toString();
    url.hash = url.hash.slice(0, q) + (rest ? `?${rest}` : "");
  }
  window.history.replaceState(null, "", url.toString());
}

/**
 * Save the starter library to the account, so its "Recipes" tab isn't empty.
 *
 * The Recipes tab lists *saved* recipes, not the public library — a fresh account sees
 * "No recipes yet." and has to discover Discover. One idempotent POST per recipe
 * (`ON CONFLICT DO NOTHING` server-side); individual failures are tolerated so a single bad row
 * can't cost the visitor the whole set.
 */
async function seedStarterSaves(username: string, recipes: readonly Recipe[]): Promise<void> {
  const ids = starterSavedRecipeIds(recipes);
  await Promise.all(
    ids.map(async (recipeId) => {
      try {
        await fetch("/api/saves", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, recipeId }),
        });
      } catch (e) {
        console.warn(`Could not save starter recipe ${recipeId}:`, e);
      }
    }),
  );
}

/**
 * Give a brand-new account something to open: a saved recipe library and a starter menu.
 *
 * Answers the backlog's *"decide which recipes to pre-seed for all users that create a new
 * account"*. Two distinct emptinesses, and both need filling:
 *
 * - **Recipes tab** — server-side, lists only what you've *saved*. Empty on a new account even
 *   though 70+ public recipes exist, because those live behind Discover.
 * - **My menu** — device-local, and the first screen anyone lands on.
 *
 * Used by both the `?demo=1` resume link and ordinary signup. Seeding here (rather than inside the
 * planner) means `MealPlanProvider` reads a populated plan on its first render and no component
 * needs to know this happened. Failures are swallowed, and the menu half no-ops if a plan already
 * exists on this device: a thin first run is better than a broken one.
 */
export async function seedStarterPlanIfEmpty(username: string): Promise<void> {
  try {
    const bundle = await loadRecipeBundle(username);
    const recipes = bundle.recipes?.recipes ?? [];

    // Saves are per-account and server-side, so they're seeded regardless of what this device
    // already has; the plan is per-device, so it defers to an existing one.
    await seedStarterSaves(username, recipes);

    if (Object.keys(loadMealPlan()).length > 0) {
      return;
    }
    const plan = buildStarterPlan(recipes);
    if (Object.keys(plan).length > 0) {
      saveMealPlan(plan);
    }
  } catch (e) {
    console.warn("Could not seed the starter recipes/menu:", e);
  }
}

function randomSuffix(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

/**
 * Create a demo account and return its username. Retries once on the (vanishingly unlikely)
 * username collision that `signup` reports as a 409.
 *
 * The password is random and thrown away — nobody signs back in to a demo account, and the
 * prototype's own recovery path (`recoverWithoutPassword`) covers anyone who somehow needs to.
 */
export async function provisionDemoAccount(): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const username = `${DEMO_USER_PREFIX}${randomSuffix()}`;
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: randomSuffix() + randomSuffix() }),
    });
    if (res.ok) {
      await seedStarterPlanIfEmpty(username);
      return username;
    }
    if (res.status !== 409) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Could not start the demo (${res.status}).`);
    }
  }
  throw new Error("Could not start the demo — please try again.");
}
