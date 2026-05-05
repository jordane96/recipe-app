import * as React from "react";

type SavedRecipesContextValue = {
  savedRecipeIds: ReadonlySet<string>;
  saveRecipe: (recipeId: string) => Promise<void>;
  unsaveRecipe: (recipeId: string) => Promise<void>;
  isSaved: (recipeId: string) => boolean;
};

const SavedRecipesContext = React.createContext<SavedRecipesContextValue | null>(null);

export function SavedRecipesProvider({
  currentUser,
  initialSavedRecipeIds,
  children,
}: {
  currentUser: string;
  initialSavedRecipeIds: string[];
  children: React.ReactNode;
}) {
  const [savedRecipeIds, setSavedRecipeIds] = React.useState<Set<string>>(
    () => new Set(initialSavedRecipeIds),
  );

  const saveRecipe = React.useCallback(
    async (recipeId: string) => {
      // Optimistic local update
      setSavedRecipeIds((prev) => {
        if (prev.has(recipeId)) return prev;
        const next = new Set(prev);
        next.add(recipeId);
        return next;
      });
      try {
        const res = await fetch("/api/saves", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: currentUser, recipeId }),
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      } catch (e) {
        // Roll back on failure
        setSavedRecipeIds((prev) => {
          if (!prev.has(recipeId)) return prev;
          const next = new Set(prev);
          next.delete(recipeId);
          return next;
        });
        throw e;
      }
    },
    [currentUser],
  );

  const unsaveRecipe = React.useCallback(
    async (recipeId: string) => {
      setSavedRecipeIds((prev) => {
        if (!prev.has(recipeId)) return prev;
        const next = new Set(prev);
        next.delete(recipeId);
        return next;
      });
      try {
        const res = await fetch(
          `/api/saves/${encodeURIComponent(recipeId)}?user=${encodeURIComponent(currentUser)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error(`Unsave failed: ${res.status}`);
      } catch (e) {
        setSavedRecipeIds((prev) => {
          if (prev.has(recipeId)) return prev;
          const next = new Set(prev);
          next.add(recipeId);
          return next;
        });
        throw e;
      }
    },
    [currentUser],
  );

  const isSaved = React.useCallback(
    (recipeId: string) => savedRecipeIds.has(recipeId),
    [savedRecipeIds],
  );

  const value = React.useMemo<SavedRecipesContextValue>(
    () => ({ savedRecipeIds, saveRecipe, unsaveRecipe, isSaved }),
    [savedRecipeIds, saveRecipe, unsaveRecipe, isSaved],
  );

  return (
    <SavedRecipesContext.Provider value={value}>
      {children}
    </SavedRecipesContext.Provider>
  );
}

export function useSavedRecipes(): SavedRecipesContextValue {
  const ctx = React.useContext(SavedRecipesContext);
  if (!ctx) {
    throw new Error("useSavedRecipes must be used inside SavedRecipesProvider");
  }
  return ctx;
}
