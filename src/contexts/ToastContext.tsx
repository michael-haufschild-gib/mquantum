import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ToastContext, type Toast, type ToastType } from './ToastContextInstance';

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerMapRef = useRef<Map<string, number>>(new Map());

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timerMapRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timerMapRef.current.delete(id);
    }, 3000);

    timerMapRef.current.set(id, timer);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none items-end">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <m.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95, transition: { duration: 0.2 } }}
              drag="x"
              dragConstraints={{ left: 0, right: 300 }}
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                if (info.offset.x > 100) {
                   setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }
              }}
              className={`
                pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-xl shadow-2xl w-[320px]
                ${toast.type === 'success' ? 'bg-success-bg border-success-border' : ''}
                ${toast.type === 'error' ? 'bg-danger-bg border-danger-border' : ''}
                ${toast.type === 'info' ? 'bg-panel/90 border-border-subtle' : ''}
              `}
            >
               <div className="p-4 flex items-start gap-3">
                   <div className={`mt-1 shrink-0 w-2 h-2 rounded-full ${
                     toast.type === 'success' ? 'bg-success-solid shadow-[0_0_10px_var(--bg-success-solid)]' :
                     toast.type === 'error' ? 'bg-danger-solid shadow-[0_0_10px_var(--bg-danger-solid)]' :
                     'bg-accent shadow-[0_0_10px_var(--theme-accent)]'
                   }`} />
                   <div className="flex-1">
                      <p className={`text-sm font-medium ${
                         toast.type === 'success' ? 'text-success' :
                         toast.type === 'error' ? 'text-danger' :
                         'text-text-primary'
                      }`}>
                        {toast.message}
                      </p>
                   </div>
               </div>
               
               {/* Progress Bar */}
               <m.div 
                 initial={{ width: "100%" }}
                 animate={{ width: "0%" }}
                 transition={{ duration: 3, ease: "linear" }}
                 className={`h-[2px] absolute bottom-0 left-0 ${
                    toast.type === 'success' ? 'bg-success-solid/50' :
                    toast.type === 'error' ? 'bg-danger-solid/50' :
                    'bg-accent/50'
                 }`}
               />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};