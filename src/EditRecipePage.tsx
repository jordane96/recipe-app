import * as React from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  IngredientCategory,
  IngredientDef,
  IngredientKind,
  IngredientSection,
  IngredientsFile,
  Recipe,
  RecipeIngredientLine,
  RecipeInstructionStep,
} from "./types";
import {
  grocerySectionLabel as categoryLabel,
  INGREDIENT_CATEGORY_ORDER as CATEGORY_ORDER,
} from "./types";
import { ingredientMap } from "./ingredientDisplay";
import {
  ADD_TO_PLAN_QUERY,
  EDIT_RECIPE_STEP_QUERY,
  readFromHistory,
  readFromPlanner,
  readFromShopping,
  readFromShoppingListItem,
  readPlanPhaseSide,
  readRecipeDetailCookReturnContext,
  readSidesListTab,
  recipeCookModePath,
  recipeDetailPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { useToast } from "./ToastContext";
import { normalizeInstructionStep } from "./recipeInstructions";
import { AddIngredientLibraryCombobox } from "./AddIngredientLibraryCombobox";
import { IngredientSearchCombobox } from "./IngredientSearchCombobox";
import { StringSearchCombobox } from "./StringSearchCombobox";

const DRAFT_PREFIX = "recipeApp.editDraft.v1:";

const ADD_MODAL_UNIT_KINDS: IngredientKind[] = ["volume", "weight", "count"];

function kindLabel(k: IngredientKind): string {
  switch (k) {
    case "volume":
      return "Volume";
    case "weight":
      return "Weight";
    case "count":
      return "Count";
    default:
      return "Other";
  }
}

function labelToKind(label: string): IngredientKind | null {
  const m: Record<string, IngredientKind> = {
    Volume: "volume",
    Weight: "weight",
    Count: "count",
    Other: "other",
  };
  return m[label] ?? null;
}

function labelToCategory(label: string): IngredientCategory | null {
  for (const c of CATEGORY_ORDER) {
    if (categoryLabel(c) === label) {
      return c;
    }
  }
  return null;
}

/** If the typed name matches exactly one catalog row (case-insensitive), treat as that pick on confirm. */
function singleIngredientMatchByName(options: IngredientDef[], raw: string): IngredientDef | null {
  const t = raw.trim().toLowerCase();
  if (!t) {
    return null;
  }
  const hits = options.filter((o) => o.name.trim().toLowerCase() === t);
  return hits.length === 1 ? hits[0]! : null;
}

function newCustomIngredientId(name: string, existingIds: Set<string>): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "item";
  let id = `custom-${slug}`;
  if (!existingIds.has(id)) {
    return id;
  }
  for (let n = 2; n < 1000; n++) {
    const tryId = `custom-${slug}-${n}`;
    if (!existingIds.has(tryId)) {
      return tryId;
    }
  }
  return `custom-${slug}-${Date.now().toString(36)}`;
}

function cloneRecipe(r: Recipe): Recipe {
  return JSON.parse(JSON.stringify(r)) as Recipe;
}

function loadStoredDraft(recipeId: string): Recipe | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + recipeId);
    if (!raw) {
      return null;
    }
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") {
      return null;
    }
    const rec = o as Recipe;
    if (rec.id !== recipeId || typeof rec.title !== "string") {
      return null;
    }
    if (!Array.isArray(rec.ingredientSections)) {
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

function saveStoredDraft(recipeId: string, draft: Recipe): void {
  localStorage.setItem(DRAFT_PREFIX + recipeId, JSON.stringify(draft));
}

function clearStoredDraft(recipeId: string): void {
  localStorage.removeItem(DRAFT_PREFIX + recipeId);
}

function ensureIngredientSections(recipe: Recipe): IngredientSection[] {
  if (recipe.ingredientSections?.length) {
    return recipe.ingredientSections.map((s) => ({
      name: s.name,
      lines: s.lines.map((l) => ({ ...l })),
    }));
  }
  return [{ name: "Main", lines: [] }];
}

function ensureInstructions(recipe: Recipe): RecipeInstructionStep[] {
  if (recipe.instructions?.length) {
    return [...recipe.instructions];
  }
  return [{ text: "" }];
}

function unitChoices(
  def: IngredientDef | undefined,
  units: IngredientsFile["units"],
): string[] {
  if (!def) {
    return [];
  }
  const k = def.unit;
  if (k === "other") {
    return [];
  }
  return [...units[k]];
}

/**
 * When the catalog marks an ingredient as measurable but a line still has missing amount/unit
 * (e.g. after upgrading `other` → volume/weight/count), fill defaults so qty/unit controls work.
 */
function repairQualitativeLinesWhenMeasurable(
  draft: Recipe,
  defs: IngredientDef[],
  units: IngredientsFile["units"],
): Recipe {
  const byId = ingredientMap(defs);
  const secs = ensureIngredientSections(draft).map((sec) => ({
    ...sec,
    lines: sec.lines.map((line) => {
      if (!line.ingredientId) {
        return line;
      }
      const def = byId.get(line.ingredientId);
      if (!def || def.unit === "other") {
        return line;
      }
      const choices = unitChoices(def, units);
      if (choices.length === 0) {
        return line;
      }
      const unitOk =
        line.unit != null && choices.includes(line.unit) ? line.unit : choices[0]!;
      const amountOk =
        line.amount != null && Number.isFinite(line.amount) && line.amount > 0
          ? line.amount
          : 1;
      if (line.amount === amountOk && line.unit === unitOk) {
        return line;
      }
      return { ...line, amount: amountOk, unit: unitOk };
    }),
  }));
  return { ...draft, ingredientSections: secs };
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

type TimerDraftFields = { minutes: string; seconds: string };

function secondsToTimerDraftFields(totalSec: number): TimerDraftFields {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return { minutes: String(m), seconds: String(r) };
}

/** Digits only for timer inputs (empty allowed while editing). */
function sanitizeTimerDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function parseTimerDraftFields(d: TimerDraftFields): number | null {
  const minRaw = d.minutes.trim();
  const secRaw = d.seconds.trim();
  if (minRaw === "" && secRaw === "") {
    return null;
  }
  const min = minRaw === "" ? 0 : Number.parseInt(minRaw, 10);
  const sec = secRaw === "" ? 0 : Number.parseInt(secRaw, 10);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || min < 0 || sec < 0 || sec > 59) {
    return null;
  }
  return min * 60 + sec;
}

function stepToParts(step: RecipeInstructionStep): {
  text: string;
  note: string;
  durationSeconds: number | undefined;
} {
  const n = normalizeInstructionStep(step);
  return {
    text: n.text,
    note: n.note ?? "",
    durationSeconds: n.durationSeconds,
  };
}

function partsToStep(parts: {
  text: string;
  note: string;
  durationSeconds: number | undefined;
}): RecipeInstructionStep {
  // Do not trim `text` (or strip-only-trim `note` body) here — controlled textareas
  // re-run this on every keystroke; trimming the end would swallow trailing spaces.
  const text = parts.text;
  const out: {
    text: string;
    note?: string;
    durationSeconds?: number;
  } = { text };
  if (parts.note.trim().length > 0) {
    out.note = parts.note;
  }
  if (
    typeof parts.durationSeconds === "number" &&
    Number.isFinite(parts.durationSeconds) &&
    parts.durationSeconds > 0
  ) {
    out.durationSeconds = Math.floor(parts.durationSeconds);
  }
  if (out.note == null && out.durationSeconds == null && text.trim().length === 0) {
    return { text: "" };
  }
  return out;
}

export function EditRecipePage({
  recipes,
  ingredients,
  ingredientsFile,
  onSaved,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
  ingredientsFile: IngredientsFile;
  onSaved?: (updated: Recipe) => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const fromSidesList = readSidesListTab(searchParams);
  const fromShopping = readFromShopping(searchParams);
  const fromShoppingListItem = readFromShoppingListItem(searchParams);
  const fromHistory = readFromHistory(searchParams);
  const fromPlanner = readFromPlanner(searchParams);
  const planKey = urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY));
  const inPlanFlow = planKey != null;
  const listSidesTab = inPlanFlow ? readPlanPhaseSide(searchParams) : fromSidesList;
  const preserve = inPlanFlow || fromShopping || fromHistory || fromPlanner ? searchParams : undefined;

  const recipe = React.useMemo(
    () => (id != null && id !== "" ? recipes.find((r) => r.id === id) : undefined),
    [recipes, id],
  );

  const [draft, setDraft] = React.useState<Recipe | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [timerDraft, setTimerDraft] = React.useState<Record<number, TimerDraftFields>>({});
  /** Step indices whose optional note editor is expanded (shown even when note is empty). */
  const [stepNoteExpanded, setStepNoteExpanded] = React.useState<Record<number, boolean>>({});
  /** Ingredient row keys `secIndex-lineIndex` with note editor expanded (shown even when note is empty). */
  const [ingredientNoteExpanded, setIngredientNoteExpanded] = React.useState<Record<string, boolean>>({});
  /** Which ingredient row has the search combobox open (`secIndex-lineIndex`). */
  const [ingredientPickerKey, setIngredientPickerKey] = React.useState<string | null>(null);
  /** Which row has the unit combobox open (`u-secIndex-lineIndex`). */
  const [unitPickerKey, setUnitPickerKey] = React.useState<string | null>(null);
  /** Avoid re-running `?editStep=` scroll/focus on every `draft` keystroke (that stole focus and ate Space). */
  const editStepDeepLinkHandledRef = React.useRef<string | null>(null);
  const [addIngredientOpen, setAddIngredientOpen] = React.useState(false);
  /** When set, confirming add updates this row instead of appending to the last section. */
  const [addIngredientReplaceSlot, setAddIngredientReplaceSlot] = React.useState<{
    secIndex: number;
    lineIndex: number;
  } | null>(null);
  /** Search / free-typed name for the add-ingredient modal. */
  const [addIngredientSearch, setAddIngredientSearch] = React.useState("");
  /** When set, the next add uses this library or draft-custom id (measure/category follow the def). */
  const [addIngredientPickId, setAddIngredientPickId] = React.useState<string | null>(null);
  const [addIngredientKind, setAddIngredientKind] = React.useState<IngredientKind>("volume");
  const [addIngredientCategory, setAddIngredientCategory] =
    React.useState<IngredientCategory>("produce");
  /** Decimal string; parsed on Add (same pattern as ingredient row amount). */
  const [addIngredientQuantity, setAddIngredientQuantity] = React.useState("1");
  /** Concrete unit from `ingredientsFile.units[kind]` (e.g. oz, lb, cup). */
  const [addIngredientUnit, setAddIngredientUnit] = React.useState("");
  const [addModalKindOpen, setAddModalKindOpen] = React.useState(false);
  const [addModalUnitOpen, setAddModalUnitOpen] = React.useState(false);
  const [addModalCatOpen, setAddModalCatOpen] = React.useState(false);
  const [addModalIngredientListOpen, setAddModalIngredientListOpen] = React.useState(false);

  const effectiveIngredients = React.useMemo(
    () => [...ingredients, ...(draft?.customIngredientDefs ?? [])],
    [ingredients, draft?.customIngredientDefs],
  );

  const byId = React.useMemo(() => ingredientMap(effectiveIngredients), [effectiveIngredients]);

  const sortedIngredientOptions = React.useMemo(
    () => [...effectiveIngredients].sort((a, b) => a.name.localeCompare(b.name)),
    [effectiveIngredients],
  );

  const addModalKindOptions = React.useMemo(
    () => [...ADD_MODAL_UNIT_KINDS.map(kindLabel), kindLabel("other")],
    [],
  );

  const addModalPickedDef = React.useMemo(
    () =>
      addIngredientPickId != null
        ? sortedIngredientOptions.find((o) => o.id === addIngredientPickId)
        : undefined,
    [addIngredientPickId, sortedIngredientOptions],
  );

  const addModalIsQualitativePick = addModalPickedDef?.unit === "other";
  const addModalCategoryOptions = React.useMemo(() => CATEGORY_ORDER.map(categoryLabel), []);

  const addModalConcreteUnitOptions = React.useMemo(() => {
    const k = addIngredientKind;
    if (k === "other") {
      return [];
    }
    return ingredientsFile.units[k] ?? [];
  }, [addIngredientKind, ingredientsFile]);

  /** Keep concrete unit valid if measure list changes while modal is open. */
  React.useEffect(() => {
    if (!addIngredientOpen) {
      return;
    }
    const opts = addModalConcreteUnitOptions;
    if (opts.length === 0) {
      return;
    }
    if (!opts.includes(addIngredientUnit)) {
      setAddIngredientUnit(opts[0]!);
    }
  }, [addIngredientOpen, addModalConcreteUnitOptions, addIngredientUnit]);

  React.useEffect(() => {
    if (!recipe) {
      setDraft(null);
      return;
    }
    const stored = loadStoredDraft(recipe.id);
    const base = stored ?? cloneRecipe(recipe);
    const defs = [...ingredients, ...(base.customIngredientDefs ?? [])];
    setDraft(repairQualitativeLinesWhenMeasurable(base, defs, ingredientsFile.units));
  }, [recipe?.id, ingredients, ingredientsFile]);

  React.useEffect(() => {
    if (!addIngredientOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setAddIngredientOpen(false);
        setAddModalKindOpen(false);
        setAddModalUnitOpen(false);
        setAddModalCatOpen(false);
        setAddIngredientPickId(null);
        setAddIngredientSearch("");
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [addIngredientOpen]);

  const cookReturn = readRecipeDetailCookReturnContext(searchParams);
  const backTo =
    id != null && id !== ""
      ? cookReturn
        ? recipeCookModePath(id, cookReturn.cookDate, cookReturn.cookSlotRef)
        : recipeDetailPath(id, listSidesTab, preserve, fromShopping, fromHistory, fromShoppingListItem)
      : "/recipes";

  /** Deep-link from cook mode (`?editStep=N`): scroll to that step and focus the instruction field once per URL. */
  React.useLayoutEffect(() => {
    if (!draft || id == null || id === "") {
      return;
    }
    const params = new URLSearchParams(location.search);
    const raw = params.get(EDIT_RECIPE_STEP_QUERY);
    if (raw == null) {
      editStepDeepLinkHandledRef.current = null;
      return;
    }
    const deepLinkSig = `${id}|${location.pathname}|${location.search}`;
    if (editStepDeepLinkHandledRef.current === deepLinkSig) {
      return;
    }
    const idx = Number.parseInt(raw, 10);
    const list = ensureInstructions(draft);

    const stripEditStepFromUrl = () => {
      // Use router `location.search` (HashRouter puts ?query inside the hash; `window.location.search` is often empty).
      const next = new URLSearchParams(location.search);
      if (!next.has(EDIT_RECIPE_STEP_QUERY)) {
        return;
      }
      next.delete(EDIT_RECIPE_STEP_QUERY);
      navigate(
        { pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : "" },
        { replace: true },
      );
    };

    if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) {
      queueMicrotask(stripEditStepFromUrl);
      return;
    }

    let canceled = false;
    // Wait one frame so step nodes exist after `draft` commit; avoid `searchParams` in deps
    // (new object each render can cancel rAF before it runs).
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (canceled) {
          return;
        }
        editStepDeepLinkHandledRef.current = deepLinkSig;
        const card = document.getElementById(`edit-recipe-step-${idx}`);
        card?.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
        const ta = card?.querySelector<HTMLTextAreaElement>(".edit-recipe-step-text");
        (ta ?? card)?.focus({ preventScroll: true });
        // Strip query after focus so the navigation pass doesn’t pull focus away first.
        setTimeout(() => {
          if (!canceled) {
            stripEditStepFromUrl();
          }
        }, 0);
      });
    });

    return () => {
      canceled = true;
      cancelAnimationFrame(raf);
    };
  }, [draft, id, location.pathname, location.search, navigate]);

  const updateTitle = (title: string) => {
    setDraft((d) => (d ? { ...d, title } : d));
  };

  const updateDescription = (description: string) => {
    setDraft((d) => (d ? { ...d, description } : d));
  };

  const updateLine = (
    secIndex: number,
    lineIndex: number,
    patch: Partial<RecipeIngredientLine>,
  ) => {
    setDraft((d) => {
      if (!d) {
        return d;
      }
      const secs = ensureIngredientSections(d);
      const sec = secs[secIndex];
      if (!sec) {
        return d;
      }
      const lines = [...sec.lines];
      const cur = lines[lineIndex];
      if (!cur) {
        return d;
      }
      const next = { ...cur, ...patch };
      lines[lineIndex] = next;
      const nextSecs = secs.map((s, i) => (i === secIndex ? { ...s, lines } : s));
      return { ...d, ingredientSections: nextSecs };
    });
  };

  const removeLine = (secIndex: number, lineIndex: number) => {
    setDraft((d) => {
      if (!d) {
        return d;
      }
      const secs = ensureIngredientSections(d).map((s) => ({ ...s, lines: [...s.lines] }));
      const sec = secs[secIndex];
      if (!sec) {
        return d;
      }
      sec.lines.splice(lineIndex, 1);
      return { ...d, ingredientSections: secs };
    });
    setIngredientNoteExpanded((m) => {
      const next: Record<string, boolean> = {};
      for (const [kStr, v] of Object.entries(m)) {
        const dash = kStr.indexOf("-");
        if (dash < 0) {
          continue;
        }
        const s = Number.parseInt(kStr.slice(0, dash), 10);
        const li = Number.parseInt(kStr.slice(dash + 1), 10);
        if (!Number.isFinite(s) || !Number.isFinite(li)) {
          continue;
        }
        if (s !== secIndex) {
          next[kStr] = v;
          continue;
        }
        if (li === lineIndex) {
          continue;
        }
        if (li > lineIndex) {
          next[`${s}-${li - 1}`] = v;
        } else {
          next[`${s}-${li}`] = v;
        }
      }
      return next;
    });
  };

  const openAddIngredientModal = (replaceSlot?: { secIndex: number; lineIndex: number } | null) => {
    setIngredientPickerKey(null);
    setUnitPickerKey(null);
    setAddIngredientReplaceSlot(replaceSlot ?? null);
    if (replaceSlot != null && draft) {
      const secs = ensureIngredientSections(draft);
      const line = secs[replaceSlot.secIndex]?.lines[replaceSlot.lineIndex];
      const pickedDef = line ? byId.get(line.ingredientId) : undefined;
      setAddIngredientSearch(pickedDef?.name ?? "");
      setAddIngredientPickId(null);
    } else {
      setAddIngredientSearch("");
      setAddIngredientPickId(null);
    }
    setAddIngredientKind("volume");
    setAddIngredientCategory("produce");
    setAddIngredientQuantity("1");
    const vol = ingredientsFile.units.volume;
    setAddIngredientUnit(vol[0] ?? "cup");
    setAddModalKindOpen(false);
    setAddModalUnitOpen(false);
    setAddModalCatOpen(false);
    setAddModalIngredientListOpen(false);
    setAddIngredientOpen(true);
  };

  const closeAddIngredientModal = () => {
    setAddIngredientOpen(false);
    setAddModalKindOpen(false);
    setAddModalUnitOpen(false);
    setAddModalCatOpen(false);
    setAddModalIngredientListOpen(false);
    setAddIngredientPickId(null);
    setAddIngredientSearch("");
    setAddIngredientReplaceSlot(null);
  };

  const selectAddModalIngredient = (def: IngredientDef) => {
    setAddIngredientPickId(def.id);
    setAddIngredientSearch(def.name);
    setAddIngredientKind(def.unit);
    setAddIngredientCategory(def.category);
    if (def.unit === "other") {
      setAddIngredientQuantity("");
      setAddIngredientUnit("");
    } else {
      const list = ingredientsFile.units[def.unit] ?? [];
      setAddIngredientUnit(list[0] ?? "each");
      setAddIngredientQuantity("1");
    }
    setAddModalKindOpen(false);
    setAddModalUnitOpen(false);
    setAddModalCatOpen(false);
    setAddModalIngredientListOpen(false);
  };

  const confirmAddIngredient = () => {
    const replaceSlot = addIngredientReplaceSlot;
    const withReplaceNote = (d: Recipe, base: RecipeIngredientLine): RecipeIngredientLine => {
      if (!replaceSlot) {
        return base;
      }
      const secs0 = ensureIngredientSections(d);
      const prev = secs0[replaceSlot.secIndex]?.lines[replaceSlot.lineIndex];
      const note = prev?.note;
      if (note != null && String(note).length > 0) {
        return { ...base, note };
      }
      return base;
    };
    const commitLine = (d: Recipe | null, baseLine: RecipeIngredientLine, customDefs?: IngredientDef[]): Recipe | null => {
      if (!d) {
        return d;
      }
      const line = withReplaceNote(d, baseLine);
      const secs = ensureIngredientSections(d).map((s) => ({ ...s, lines: [...s.lines] }));
      if (replaceSlot != null) {
        const { secIndex, lineIndex } = replaceSlot;
        const sec = secs[secIndex];
        if (!sec || lineIndex < 0 || lineIndex >= sec.lines.length) {
          return d;
        }
        sec.lines[lineIndex] = line;
        return { ...d, ingredientSections: secs, ...(customDefs ? { customIngredientDefs: customDefs } : {}) };
      }
      const last = secs[secs.length - 1] ?? { name: "Main", lines: [] };
      last.lines.push(line);
      secs[secs.length - 1] = last;
      return { ...d, ingredientSections: secs, ...(customDefs ? { customIngredientDefs: customDefs } : {}) };
    };

    let picked: IngredientDef | undefined;
    if (addIngredientPickId != null) {
      picked = sortedIngredientOptions.find((o) => o.id === addIngredientPickId);
      if (!picked) {
        showToast("Could not find that ingredient—select it again.");
        return;
      }
    } else {
      picked = singleIngredientMatchByName(sortedIngredientOptions, addIngredientSearch) ?? undefined;
    }

    if (picked) {
      if (picked.unit === "other") {
        setDraft((d) =>
          commitLine(d, {
            ingredientId: picked!.id,
            amount: null,
            unit: null,
          }),
        );
        closeAddIngredientModal();
        showToast(
          replaceSlot ? `Updated row to “${picked.name}”.` : `Added “${picked.name}” to the recipe.`,
        );
        return;
      }

      const qtyRaw = addIngredientQuantity.trim();
      if (qtyRaw === "") {
        showToast("Enter a quantity.");
        return;
      }
      const amount = Number.parseFloat(qtyRaw);
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast("Enter a positive number for quantity.");
        return;
      }
      const unitList = ingredientsFile.units[picked.unit];
      const firstUnit = unitList?.[0] ?? "each";
      const lineUnit =
        addIngredientUnit && unitList?.includes(addIngredientUnit)
          ? addIngredientUnit
          : firstUnit;

      setDraft((d) =>
        commitLine(d, {
          ingredientId: picked!.id,
          amount,
          unit: lineUnit,
        }),
      );
      closeAddIngredientModal();
      showToast(
        replaceSlot ? `Updated row to “${picked.name}”.` : `Added “${picked.name}” to the recipe.`,
      );
      return;
    }

    const name = addIngredientSearch.trim();
    if (!name) {
      showToast("Pick an ingredient from the list, or type a name in the dropdown and click Add new.");
      return;
    }
    const kind = addIngredientKind;
    if (kind === "other") {
      showToast("For a new ingredient, choose Volume, Weight, or Count—or pick an existing row above.");
      return;
    }
    const qtyRaw = addIngredientQuantity.trim();
    if (qtyRaw === "") {
      showToast("Enter a quantity.");
      return;
    }
    const amount = Number.parseFloat(qtyRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a positive number for quantity.");
      return;
    }
    const unitList = ingredientsFile.units[kind];
    const firstUnit = unitList?.[0] ?? "each";
    const lineUnit =
      addIngredientUnit && unitList?.includes(addIngredientUnit)
        ? addIngredientUnit
        : firstUnit;

    setDraft((d) => {
      if (!d) {
        return d;
      }
      const ids = new Set<string>();
      for (const ing of ingredients) {
        ids.add(ing.id);
      }
      for (const c of d.customIngredientDefs ?? []) {
        ids.add(c.id);
      }
      for (const sec of ensureIngredientSections(d)) {
        for (const line of sec.lines) {
          ids.add(line.ingredientId);
        }
      }
      const id = newCustomIngredientId(name, ids);
      const def: IngredientDef = {
        id,
        name,
        unit: kind,
        category: addIngredientCategory,
      };
      const defs = [...(d.customIngredientDefs ?? []), def];
      return (
        commitLine(
          d,
          {
            ingredientId: id,
            amount,
            unit: lineUnit,
          },
          defs,
        ) ?? d
      );
    });
    closeAddIngredientModal();
    showToast(replaceSlot ? `Updated row with “${name}”.` : `Added “${name}” to the recipe.`);
  };

  const updateStep = (
    index: number,
    patch: { text?: string; note?: string; durationSeconds?: number | undefined },
  ) => {
    setDraft((d) => {
      if (!d) {
        return d;
      }
      const list = [...ensureInstructions(d)];
      const cur = list[index];
      const parts = stepToParts(cur ?? "");
      const next = partsToStep({
        text: patch.text ?? parts.text,
        note: patch.note ?? parts.note,
        // Use `in` so `{ durationSeconds: undefined }` clears the timer (`undefined !== undefined` is false).
        durationSeconds:
          "durationSeconds" in patch ? patch.durationSeconds : parts.durationSeconds,
      });
      list[index] = next;
      return { ...d, instructions: list };
    });
  };

  const addStep = () => {
    setDraft((d) => {
      if (!d) {
        return d;
      }
      const list = [...ensureInstructions(d), { text: "" }];
      return { ...d, instructions: list };
    });
  };

  /** Inserts a blank step immediately after `index` (timer UI drafts shift so they stay on the same step). */
  const insertStepAfter = (index: number) => {
    setDraft((d) => {
      if (!d) {
        return d;
      }
      const list = [...ensureInstructions(d)];
      list.splice(index + 1, 0, { text: "" });
      return { ...d, instructions: list };
    });
    setTimerDraft((m) => {
      if (Object.keys(m).length === 0) {
        return m;
      }
      const next: Record<number, TimerDraftFields> = {};
      for (const [kStr, v] of Object.entries(m)) {
        const k = Number(kStr);
        if (Number.isFinite(k) && k > index) {
          next[k + 1] = v;
        } else {
          next[k] = v;
        }
      }
      return next;
    });
    setStepNoteExpanded((m) => {
      if (Object.keys(m).length === 0) {
        return m;
      }
      const next: Record<number, boolean> = {};
      for (const [kStr, v] of Object.entries(m)) {
        const k = Number(kStr);
        if (Number.isFinite(k) && k > index) {
          next[k + 1] = v;
        } else {
          next[k] = v;
        }
      }
      return next;
    });
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    if (!draft) {
      return;
    }
    const listPre = ensureInstructions(draft);
    const j = index + dir;
    if (j < 0 || j >= listPre.length) {
      return;
    }
    setDraft((d) => {
      if (!d) {
        return d;
      }
      const list = [...ensureInstructions(d)];
      if (j < 0 || j >= list.length) {
        return d;
      }
      const t = list[index]!;
      list[index] = list[j]!;
      list[j] = t;
      return { ...d, instructions: list };
    });
    setStepNoteExpanded((m) => {
      const next: Record<number, boolean> = { ...m };
      const ai = next[index];
      const aj = next[j];
      if (ai !== undefined) {
        next[j] = ai;
      } else {
        delete next[j];
      }
      if (aj !== undefined) {
        next[index] = aj;
      } else {
        delete next[index];
      }
      return next;
    });
  };

  const removeStep = (index: number) => {
    let resetToSingleEmpty = false;
    setDraft((d) => {
      if (!d) {
        return d;
      }
      const list = [...ensureInstructions(d)];
      if (list.length <= 1) {
        resetToSingleEmpty = true;
        list[0] = { text: "" };
        return { ...d, instructions: list };
      }
      list.splice(index, 1);
      return { ...d, instructions: list };
    });
    setStepNoteExpanded((m) => {
      if (resetToSingleEmpty) {
        return {};
      }
      const next: Record<number, boolean> = {};
      for (const [kStr, v] of Object.entries(m)) {
        const k = Number(kStr);
        if (!Number.isFinite(k)) {
          continue;
        }
        if (k === index) {
          continue;
        }
        if (k > index) {
          next[k - 1] = v;
        } else {
          next[k] = v;
        }
      }
      return next;
    });
  };

  const onSave = async () => {
    if (!recipe || !draft || saving) {
      return;
    }
    if (!draft.title.trim()) {
      showToast("Add a recipe name before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        showToast(body.error ?? "Failed to save recipe. Try again.");
        return;
      }
      clearStoredDraft(recipe.id);
      onSaved?.(draft);
      navigate(backTo);
    } catch {
      showToast("Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = () => {
    if (!recipe) {
      navigate(backTo);
      return;
    }
    clearStoredDraft(recipe.id);
    showToast("Discarded local draft.");
    navigate(backTo);
  };

  if (!id) {
    return (
      <div className="edit-recipe-page">
        <p className="empty">
          Missing recipe. <Link to="/recipes">Recipes</Link>
        </p>
      </div>
    );
  }

  if (!recipe || !draft) {
    return (
      <div className="edit-recipe-page">
        <p className="empty">
          Recipe not found. <Link to="/recipes">Recipes</Link>
        </p>
      </div>
    );
  }

  const secs = ensureIngredientSections(draft);
  const steps = ensureInstructions(draft);

  return (
    <div className="edit-recipe-page edit-recipe-page--bottom-cta">
      <section className="edit-recipe-section" aria-labelledby="edit-recipe-name-label">
        <h2 id="edit-recipe-name-label" className="edit-recipe-label">
          Recipe name
        </h2>
        <input
          type="text"
          className="edit-recipe-input edit-recipe-input--title"
          value={draft.title}
          onChange={(e) => updateTitle(e.target.value)}
          autoComplete="off"
          aria-label="Recipe name"
        />
      </section>

      <section className="edit-recipe-section" aria-labelledby="edit-recipe-desc-label">
        <h2 id="edit-recipe-desc-label" className="edit-recipe-label">
          Recipe description
        </h2>
        <p className="edit-recipe-field-hint">Optional — a short summary shown at the top of the recipe page.</p>
        <textarea
          id="edit-recipe-description"
          className="edit-recipe-input edit-recipe-description"
          value={draft.description ?? ""}
          onChange={(e) => updateDescription(e.target.value)}
          rows={3}
          placeholder="e.g. Crispy air-fried chicken with a simple spice rub."
          aria-labelledby="edit-recipe-desc-label"
        />
      </section>

      <section className="edit-recipe-section" aria-labelledby="edit-recipe-ing-label">
        <h2 id="edit-recipe-ing-label" className="edit-recipe-label">
          Ingredients
        </h2>
        <div className="edit-recipe-ing-card">
          {secs.flatMap((sec, secIndex) =>
            sec.lines.map((line, lineIndex) => {
              const def = byId.get(line.ingredientId);
              const choices = unitChoices(def, ingredientsFile.units);
              /** Catalog "other" = no amount/unit UI. Do not treat empty amount while editing as qualitative or the qty field locks. */
              const catalogQualitative = def?.unit === "other";
              const rowKey = `${secIndex}-${lineIndex}`;
              const unitKey = `u-${secIndex}-${lineIndex}`;
              const comboOpen = ingredientPickerKey === rowKey;
              const unitOpen = unitPickerKey === unitKey;
              const hasIngNote = (line.note ?? "").trim().length > 0;
              const showIngNote = hasIngNote || ingredientNoteExpanded[rowKey] === true;
              return (
                <div
                  key={`${sec.name}-${secIndex}-${lineIndex}-${line.ingredientId}`}
                  className="edit-recipe-ing-block"
                >
                  <div
                    className={`edit-recipe-ing-row${comboOpen || unitOpen ? " edit-recipe-ing-row--open" : ""}`}
                  >
                    <IngredientSearchCombobox
                      valueId={line.ingredientId}
                      options={sortedIngredientOptions}
                      unknownLabel={
                        line.ingredientId
                          ? `Unknown (${line.ingredientId})`
                          : "Select ingredient"
                      }
                      isOpen={comboOpen}
                      onRequestOpen={() => {
                        setUnitPickerKey(null);
                        setIngredientPickerKey(rowKey);
                      }}
                      onRequestClose={() =>
                        setIngredientPickerKey((k) => (k === rowKey ? null : k))
                      }
                      onSelect={(nid) => {
                        const d2 = byId.get(nid);
                        const firstU = d2 ? unitChoices(d2, ingredientsFile.units)[0] ?? null : null;
                        updateLine(secIndex, lineIndex, {
                          ingredientId: nid,
                          amount: firstU == null ? null : 1,
                          unit: firstU,
                        });
                      }}
                      onAddNew={() => openAddIngredientModal({ secIndex, lineIndex })}
                      aria-label={`Ingredient ${lineIndex + 1}`}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      className="edit-recipe-ing-amt"
                      disabled={catalogQualitative}
                      value={
                        catalogQualitative
                          ? ""
                          : line.amount != null
                            ? String(line.amount)
                            : ""
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (v === "") {
                          if (catalogQualitative) {
                            updateLine(secIndex, lineIndex, { amount: null, unit: null });
                          } else {
                            updateLine(secIndex, lineIndex, { amount: null });
                          }
                          return;
                        }
                        const n = Number.parseFloat(v);
                        if (Number.isFinite(n)) {
                          updateLine(secIndex, lineIndex, { amount: n });
                        }
                      }}
                      aria-label="Amount"
                    />
                    <StringSearchCombobox
                      value={catalogQualitative ? "" : (line.unit ?? "")}
                      options={choices}
                      isOpen={unitOpen}
                      onRequestOpen={() => {
                        setIngredientPickerKey(null);
                        setUnitPickerKey(unitKey);
                      }}
                      onRequestClose={() =>
                        setUnitPickerKey((k) => (k === unitKey ? null : k))
                      }
                      onSelect={(u) => {
                        updateLine(secIndex, lineIndex, {
                          unit: u || null,
                          amount: line.amount ?? 1,
                        });
                      }}
                      aria-label="Unit"
                      disabled={catalogQualitative || choices.length === 0}
                      fallbackLabel={line.unit ?? "—"}
                    />
                    <button
                      type="button"
                      className="edit-recipe-ing-remove"
                      onClick={() => removeLine(secIndex, lineIndex)}
                      aria-label="Remove ingredient"
                    >
                      ×
                    </button>
                  </div>
                  {showIngNote ? (
                    <div className="edit-recipe-ing-note-row">
                      <label
                        className="edit-recipe-ing-note-label"
                        htmlFor={`edit-recipe-ing-note-${secIndex}-${lineIndex}`}
                      >
                        Note
                      </label>
                      <div className="edit-recipe-ing-note-field-row">
                        <textarea
                          id={`edit-recipe-ing-note-${secIndex}-${lineIndex}`}
                          className="edit-recipe-ing-note"
                          value={line.note ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateLine(secIndex, lineIndex, {
                              note: v === "" ? undefined : v,
                            });
                            if (v.trim() === "") {
                              setIngredientNoteExpanded((m) => {
                                const n = { ...m };
                                delete n[rowKey];
                                return n;
                              });
                            }
                          }}
                          placeholder="e.g. prep, brand, or how it appears on the shopping list"
                          rows={2}
                          aria-label={`Note for ${def?.name ?? line.ingredientId ?? "ingredient"}`}
                        />
                        <button
                          type="button"
                          className="edit-recipe-ing-remove edit-recipe-ing-note-remove"
                          aria-label="Remove note"
                          onClick={() => {
                            updateLine(secIndex, lineIndex, { note: undefined });
                            setIngredientNoteExpanded((m) => {
                              const n = { ...m };
                              delete n[rowKey];
                              return n;
                            });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {!showIngNote ? (
                    <div className="edit-recipe-ing-subactions">
                      <button
                        type="button"
                        className="edit-recipe-add-sub"
                        onClick={() => {
                          setIngredientNoteExpanded((m) => ({ ...m, [rowKey]: true }));
                          window.setTimeout(() => {
                            document.getElementById(`edit-recipe-ing-note-${secIndex}-${lineIndex}`)?.focus();
                          }, 0);
                        }}
                      >
                        + Add note
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }),
          )}
        </div>
        <button type="button" className="edit-recipe-add-line" onClick={() => openAddIngredientModal()}>
          + Add ingredient
        </button>
      </section>

      <section className="edit-recipe-section" aria-labelledby="edit-recipe-steps-label">
        <h2 id="edit-recipe-steps-label" className="edit-recipe-label">
          Steps
        </h2>
        <div className="edit-recipe-steps">
          {steps.map((step, i) => {
            const parts = stepToParts(step);
            const hasTimer =
              typeof parts.durationSeconds === "number" &&
              Number.isFinite(parts.durationSeconds) &&
              parts.durationSeconds > 0;
            const timerOpenKey = timerDraft[i] !== undefined;
            const hasStepNote = parts.note.trim().length > 0;
            const showStepNote = hasStepNote || stepNoteExpanded[i] === true;
            return (
              <div
                key={`step-${i}`}
                id={`edit-recipe-step-${i}`}
                className="edit-recipe-step-card"
                tabIndex={-1}
                aria-labelledby={`edit-recipe-step-${i}-heading`}
              >
                <div className="edit-recipe-step-head">
                  <span className="edit-recipe-step-num" id={`edit-recipe-step-${i}-heading`}>
                    Step {i + 1}
                  </span>
                  <div className="edit-recipe-step-move">
                    <button
                      type="button"
                      className="edit-recipe-step-move-btn edit-recipe-step-move-btn--add"
                      onClick={() => insertStepAfter(i)}
                      aria-label={`Add new step after step ${i + 1}`}
                      title="Add step below"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="edit-recipe-step-move-btn"
                      disabled={i === 0}
                      onClick={() => moveStep(i, -1)}
                      aria-label="Move step up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="edit-recipe-step-move-btn"
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                      aria-label="Move step down"
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <textarea
                  className="edit-recipe-step-text"
                  value={parts.text}
                  onChange={(e) => updateStep(i, { text: e.target.value })}
                  rows={3}
                  aria-label={`Step ${i + 1} instruction`}
                />
                {showStepNote ? (
                  <div className="edit-recipe-step-note-row">
                    <label className="edit-recipe-step-note-label" htmlFor={`edit-recipe-step-${i}-note`}>
                      Note
                    </label>
                    <div className="edit-recipe-step-note-field-row">
                      <textarea
                        id={`edit-recipe-step-${i}-note`}
                        className="edit-recipe-step-note"
                        value={parts.note}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateStep(i, { note: v });
                          if (v.trim() === "") {
                            setStepNoteExpanded((m) => {
                              const n = { ...m };
                              delete n[i];
                              return n;
                            });
                          }
                        }}
                        placeholder="Optional note"
                        aria-label={`Step ${i + 1} note`}
                        rows={2}
                      />
                      <button
                        type="button"
                        className="edit-recipe-ing-remove edit-recipe-step-note-remove"
                        aria-label="Remove step note"
                        onClick={() => {
                          updateStep(i, { note: "" });
                          setStepNoteExpanded((m) => {
                            const n = { ...m };
                            delete n[i];
                            return n;
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ) : null}
                {hasTimer ? (
                  <div className="edit-recipe-step-timer">
                    <span className="edit-recipe-step-timer-label">
                      Timer: {formatDuration(parts.durationSeconds!)}
                    </span>
                    <button
                      type="button"
                      className="edit-recipe-step-timer-edit"
                      onClick={() =>
                        setTimerDraft((m) => ({
                          ...m,
                          [i]: secondsToTimerDraftFields(parts.durationSeconds!),
                        }))
                      }
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      className="edit-recipe-step-timer-clear"
                      onClick={() => {
                        updateStep(i, { durationSeconds: undefined });
                        setTimerDraft((m) => {
                          const n = { ...m };
                          delete n[i];
                          return n;
                        });
                      }}
                    >
                      clear
                    </button>
                  </div>
                ) : null}
                {timerOpenKey ? (
                  <div className="edit-recipe-step-timer-form">
                    <div className="edit-recipe-step-timer-field">
                      <label className="edit-recipe-step-timer-field-label" htmlFor={`edit-step-${i}-timer-min`}>
                        Minutes
                      </label>
                      <input
                        id={`edit-step-${i}-timer-min`}
                        type="text"
                        inputMode="numeric"
                        className="edit-recipe-input edit-recipe-input--timer-part"
                        placeholder="0"
                        autoComplete="off"
                        value={timerDraft[i]?.minutes ?? ""}
                        onChange={(e) =>
                          setTimerDraft((m) => ({
                            ...m,
                            [i]: {
                              minutes: sanitizeTimerDigits(e.target.value),
                              seconds: m[i]?.seconds ?? "",
                            },
                          }))
                        }
                        aria-label={`Step ${i + 1} timer minutes`}
                      />
                    </div>
                    <div className="edit-recipe-step-timer-field">
                      <label className="edit-recipe-step-timer-field-label" htmlFor={`edit-step-${i}-timer-sec`}>
                        Seconds
                      </label>
                      <input
                        id={`edit-step-${i}-timer-sec`}
                        type="text"
                        inputMode="numeric"
                        className="edit-recipe-input edit-recipe-input--timer-part"
                        placeholder="0"
                        autoComplete="off"
                        value={timerDraft[i]?.seconds ?? ""}
                        onChange={(e) =>
                          setTimerDraft((m) => ({
                            ...m,
                            [i]: {
                              minutes: m[i]?.minutes ?? "",
                              seconds: sanitizeTimerDigits(e.target.value),
                            },
                          }))
                        }
                        aria-label={`Step ${i + 1} timer seconds (0–59)`}
                      />
                    </div>
                    <div className="edit-recipe-step-timer-form-actions">
                      <button
                        type="button"
                        className="btn-primary btn-compact"
                        onClick={() => {
                          const fields = timerDraft[i] ?? { minutes: "", seconds: "" };
                          const parsed = parseTimerDraftFields(fields);
                          if (parsed == null || parsed <= 0) {
                            showToast("Enter minutes and seconds (0–59 for seconds). Total time must be greater than zero.");
                            return;
                          }
                          updateStep(i, { durationSeconds: parsed });
                          setTimerDraft((m) => {
                            const n = { ...m };
                            delete n[i];
                            return n;
                          });
                        }}
                      >
                        Set
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-compact"
                        onClick={() =>
                          setTimerDraft((m) => {
                            const n = { ...m };
                            delete n[i];
                            return n;
                          })
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="edit-recipe-step-subactions">
                  {!showStepNote ? (
                    <button
                      type="button"
                      className="edit-recipe-add-sub"
                      onClick={() => {
                        setStepNoteExpanded((m) => ({ ...m, [i]: true }));
                        window.setTimeout(() => {
                          document.getElementById(`edit-recipe-step-${i}-note`)?.focus();
                        }, 0);
                      }}
                    >
                      + Add note
                    </button>
                  ) : null}
                  {!hasTimer && !timerOpenKey ? (
                    <button
                      type="button"
                      className="edit-recipe-add-sub"
                      onClick={() =>
                        setTimerDraft((m) => ({
                          ...m,
                          [i]: { minutes: "", seconds: "" },
                        }))
                      }
                    >
                      + Add timer
                    </button>
                  ) : null}
                  <button type="button" className="edit-recipe-add-sub" onClick={() => removeStep(i)}>
                    Delete step
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="edit-recipe-add-line" onClick={addStep}>
          + Add step
        </button>
      </section>

      <div className="recipe-list-cart-bar" role="region" aria-label="Save or discard edits">
        <div className="recipe-list-cart-bar-inner">
          <button type="button" className="btn-primary btn-cta-wide" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn-secondary btn-cta-wide" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>

      {addIngredientOpen ? (
        <div
          className="edit-recipe-modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeAddIngredientModal();
            }
          }}
        >
          <div
            className="edit-recipe-modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-recipe-add-ing-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="edit-recipe-modal-body">
              <h2 id="edit-recipe-add-ing-title" className="edit-recipe-modal-title">
                {addIngredientReplaceSlot ? "Replace ingredient" : "Add ingredient"}
              </h2>

              <div className="edit-recipe-modal-field">
                <label className="edit-recipe-label" htmlFor="edit-recipe-add-ing-combo-trigger">
                  Ingredient list
                </label>
                <AddIngredientLibraryCombobox
                  id="edit-recipe-add-ing-combo-trigger"
                  options={sortedIngredientOptions}
                  search={addIngredientSearch}
                  onSearchChange={(v) => {
                    setAddIngredientSearch(v);
                    setAddIngredientPickId(null);
                  }}
                  pickId={addIngredientPickId}
                  isOpen={addModalIngredientListOpen}
                  onRequestOpen={() => {
                    setAddModalKindOpen(false);
                    setAddModalUnitOpen(false);
                    setAddModalCatOpen(false);
                    setAddModalIngredientListOpen(true);
                  }}
                  onRequestClose={() => setAddModalIngredientListOpen(false)}
                  onSelectIngredient={selectAddModalIngredient}
                  onAddNew={() => {
                    setAddIngredientPickId(null);
                    setAddModalKindOpen(false);
                    setAddModalUnitOpen(false);
                    setAddModalCatOpen(false);
                  }}
                  autoFocus
                />
              </div>

              <div className="edit-recipe-modal-field">
              <span className="edit-recipe-label" id="edit-recipe-add-ing-measure-lbl">
                Measure
              </span>
              <StringSearchCombobox
                value={kindLabel(addIngredientKind)}
                options={addModalKindOptions}
                isOpen={addModalKindOpen}
                onRequestOpen={() => {
                  setAddModalIngredientListOpen(false);
                  setAddModalCatOpen(false);
                  setAddModalUnitOpen(false);
                  setAddModalKindOpen(true);
                }}
                onRequestClose={() => setAddModalKindOpen(false)}
                onSelect={(label) => {
                  const k = labelToKind(label);
                  if (!k) {
                    return;
                  }
                  setAddIngredientPickId(null);
                  if (k === "other") {
                    setAddIngredientKind("other");
                    setAddIngredientUnit("");
                    return;
                  }
                  setAddIngredientKind(k);
                  const list = ingredientsFile.units[k] ?? [];
                  setAddIngredientUnit(list[0] ?? "each");
                }}
                aria-label="Measure: volume, weight, count, or other"
                disabled={addIngredientPickId != null}
              />
            </div>

            <div className="edit-recipe-modal-field">
              <span className="edit-recipe-label" id="edit-recipe-add-ing-unit-lbl">
                Unit
              </span>
              <StringSearchCombobox
                value={addIngredientUnit}
                options={addModalConcreteUnitOptions}
                isOpen={addModalUnitOpen}
                onRequestOpen={() => {
                  setAddModalIngredientListOpen(false);
                  setAddModalKindOpen(false);
                  setAddModalCatOpen(false);
                  setAddModalUnitOpen(true);
                }}
                onRequestClose={() => setAddModalUnitOpen(false)}
                onSelect={(u) => {
                  if (u) {
                    setAddIngredientUnit(u);
                  }
                }}
                aria-label="Unit (ounces, pounds, cups, etc.)"
                disabled={addModalConcreteUnitOptions.length === 0 || addModalIsQualitativePick}
                fallbackLabel={addIngredientUnit || "—"}
              />
            </div>

            <div className="edit-recipe-modal-field">
              <label className="edit-recipe-label" htmlFor="edit-recipe-add-ing-qty">
                Quantity
              </label>
              <input
                id="edit-recipe-add-ing-qty"
                type="text"
                inputMode="decimal"
                className="edit-recipe-input"
                value={addIngredientQuantity}
                onChange={(e) => setAddIngredientQuantity(e.target.value)}
                placeholder="e.g. 2 or 0.5"
                autoComplete="off"
                aria-label="Quantity"
                disabled={addModalIsQualitativePick}
              />
            </div>

            <div className="edit-recipe-modal-field">
              <span className="edit-recipe-label" id="edit-recipe-add-ing-cat-lbl">
                Category
              </span>
              <StringSearchCombobox
                value={categoryLabel(addIngredientCategory)}
                options={addModalCategoryOptions}
                isOpen={addModalCatOpen}
                onRequestOpen={() => {
                  setAddModalIngredientListOpen(false);
                  setAddModalKindOpen(false);
                  setAddModalUnitOpen(false);
                  setAddModalCatOpen(true);
                }}
                onRequestClose={() => setAddModalCatOpen(false)}
                onSelect={(label) => {
                  const c = labelToCategory(label);
                  if (c) {
                    setAddIngredientCategory(c);
                  }
                }}
                aria-label="Grocery category"
                disabled={addIngredientPickId != null}
              />
            </div>
            </div>

            <div className="edit-recipe-modal-actions edit-recipe-modal-actions--sticky">
              <button type="button" className="btn-primary btn-cta-wide" onClick={confirmAddIngredient}>
                {addIngredientReplaceSlot ? "Replace in recipe" : "Add to recipe"}
              </button>
              <button type="button" className="btn-secondary btn-cta-wide" onClick={closeAddIngredientModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
