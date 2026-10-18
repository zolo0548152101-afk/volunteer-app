"use client";
import { useEffect, useRef, useState } from "react";

type T = { id: number; text: string; tone: "ok" | "bad" };

/** מציג הודעה קצרה ("נשמר") בתחתית המסך. מפעילים עם showToast, מכל רכיב לקוח */
export function showToast(text: string, tone: "ok" | "bad" = "ok") {
  setTimeout(() => window.dispatchEvent(new CustomEvent("app-toast", { detail: { text, tone } })), 60);
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  const n = useRef(0);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; tone: "ok" | "bad" }>).detail;
      const id = ++n.current;
      setItems((p) => [...p, { id, text: d.text, tone: d.tone }]);
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), d.tone === "bad" ? 6000 : 3500);
    };
    window.addEventListener("app-toast", on);
    return () => window.removeEventListener("app-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" role="status" aria-live="polite">
      {items.map((x) => (
        <p key={x.id} className={`pointer-events-auto rounded-full px-5 py-2.5 text-sm font-medium shadow-lg ${x.tone === "bad" ? "bg-bad text-white" : "bg-ink text-paper"}`}>{x.text}</p>
      ))}
    </div>
  );
}
