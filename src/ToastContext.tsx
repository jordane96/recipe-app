import * as React from "react";

type ToastCtx = {
  showToast: (message: string) => void;
};

const ToastContext = React.createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const v = React.useContext(ToastContext);
  if (!v) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return v;
}

const TOAST_MS = 3800;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<{ message: string; id: number } | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = React.useCallback((message: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setToast({ message, id: Date.now() });
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, TOAST_MS);
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
            {toast.message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
