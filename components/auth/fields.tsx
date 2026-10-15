const input = "rounded-lg border border-border bg-transparent px-3 py-2 text-base";

export function Field({ label, name, type = "text", autoComplete, minLength }: {
  label: string; name: string; type?: string; autoComplete?: string; minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input name={name} type={type} autoComplete={autoComplete} minLength={minLength} required className={input} />
    </label>
  );
}

export function Submit({ children, pending }: { children: React.ReactNode; pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-60">
      {children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-sm text-red-600">{message}</p> : null;
}
