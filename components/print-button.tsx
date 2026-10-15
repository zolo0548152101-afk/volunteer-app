"use client";

export function PrintButton({ label }: { label: string }) {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground print:hidden">{label}</button>;
}
