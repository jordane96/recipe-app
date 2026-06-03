import * as React from "react";

const SEEN_KEY = "recipe_app_onboarding_seen_v1";

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore (private mode etc.) */
  }
}

type Slide = { src: string; headline: string; body: string };

const SLIDES: Slide[] = [
  {
    src: "/onboarding/01-add-to-home.gif",
    headline: "Add us to your Home Screen",
    body:
      'In Safari, tap the Share button, then "Add to Home Screen" so the planner opens full-screen like a real app.',
  },
  {
    src: "/onboarding/02-empty-menu.png",
    headline: "Start with your menu",
    body: "Your menu holds the meals you plan to cook this week. Add meals to get started.",
  },
  {
    src: "/onboarding/03-add-recipe.png",
    headline: "Add recipes you love",
    body: 'Browse Recipes, pick the ones you want, and tap "Add to menu".',
  },
  {
    src: "/onboarding/04-menu-filled.png",
    headline: "Your week takes shape",
    body: "Planned meals appear in your menu — adjust servings, cook, or shop straight from here.",
  },
  {
    src: "/onboarding/05-shopping.png",
    headline: "Shop in one tap",
    body: "Your menu builds a grocery list, grouped by aisle and scaled to your servings.",
  },
  {
    src: "/onboarding/06-cook.png",
    headline: "Cook step by step",
    body: "Cook mode walks you through each step at a glance, with built-in timers and notes.",
  },
  {
    src: "/onboarding/07-log.png",
    headline: "Track your progress",
    body: "Every cooked meal lands on your calendar so you can look back, track your cooking, and see how much you've saved!",
  },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = React.useState(0);
  const total = SLIDES.length;
  const isLast = index === total - 1;
  const touchStartX = React.useRef<number | null>(null);

  const finish = React.useCallback(() => {
    markOnboardingSeen();
    onClose();
  }, [onClose]);

  const goNext = React.useCallback(() => {
    setIndex((i) => (i >= total - 1 ? i : i + 1));
  }, [total]);

  const goPrev = React.useCallback(() => {
    setIndex((i) => (i <= 0 ? i : i - 1));
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [finish, goNext, goPrev]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const slide = SLIDES[index];

  return (
    <div
      className="ob-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="How the meal planner works"
    >
      <div className="ob-top">
        <span className="ob-counter">
          {index + 1} / {total}
        </span>
        <button type="button" className="ob-skip" onClick={finish}>
          {isLast ? "Done" : "Skip"}
        </button>
      </div>

      <div
        className="ob-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="ob-phone" key={slide.src}>
          <img className="ob-media" src={slide.src} alt={slide.headline} />
        </div>

        <div className="ob-copy">
          <h2 className="ob-headline">{slide.headline}</h2>
          <p className="ob-body">{slide.body}</p>
        </div>
      </div>

      <div className="ob-bottom">
        <div className="ob-dots" aria-hidden>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={i === index ? "ob-dot ob-dot--active" : "ob-dot"}
            />
          ))}
        </div>
        <div className="ob-actions">
          {index > 0 ? (
            <button type="button" className="ob-back" onClick={goPrev}>
              Back
            </button>
          ) : null}
          <button
            type="button"
            className="ob-cta"
            onClick={isLast ? finish : goNext}
          >
            {isLast ? "Get cooking" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
