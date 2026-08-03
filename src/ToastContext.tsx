import * as React from "react";

/**
 * Optional action rendered as a button inside the toast — used for undoing
 * destructive operations (e.g. clearing the shopping list). Toasts with an
 * action stay on screen longer, since the user has to read and decide.
 */
export type ToastAction = { label: string; onAction: () => void };

type ToastCtx = {
  showToast: (message: string, action?: ToastAction) => void;
};

const ToastContext = React.createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const v = React.useContext(ToastContext);
  if (!v) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return v;
}

const TOAST_MS = 3000;
/**
 * Actionable toasts need a beat longer than plain ones to notice, read and tap — but 8s was
 * long enough to feel like it was stuck to the screen. 4.5s covers the tap without overstaying.
 */
const TOAST_ACTION_MS = 4500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<
    { message: string; id: number; action?: ToastAction } | null
  >(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = React.useCallback((message: string, action?: ToastAction) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setToast({ message, id: Date.now(), action });
    timerRef.current = setTimeout(
      () => {
        setToast(null);
        timerRef.current = null;
      },
      action ? TOAST_ACTION_MS : TOAST_MS,
    );
  }, []);

  const runAction = React.useCallback((action: ToastAction) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
    action.onAction();
  }, []);

  React.useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-anchor" aria-live="polite" aria-relevant="additions text">
        {toast ? (
          <div key={toast.id} className="toast toast--success" role="status">
            <span className="toast-message">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => runAction(toast.action!)}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
