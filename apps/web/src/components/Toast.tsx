import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(message: Omit<ToastMessage, 'id'>) => void>(() => {});

export const useToast = () => useContext(ToastContext);

/** One message at a time, announced politely; an Undo action stays for 8 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<number | null>(null);
  const counter = useRef(0);

  const show = useCallback((next: Omit<ToastMessage, 'id'>) => {
    counter.current += 1;
    setMessage({ ...next, id: counter.current });
  }, []);

  useEffect(() => {
    if (!message) return;
    timer.current = window.setTimeout(() => setMessage(null), message.action ? 8000 : 4000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [message]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {message && (
          <div className="toast" key={message.id}>
            <span>{message.text}</span>
            {message.action && (
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => {
                  message.action!.run();
                  setMessage(null);
                }}
              >
                {message.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
