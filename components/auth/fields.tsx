const input = "min-h-11 rounded-lg border border-border bg-transparent px-3 py-2 text-base";

/** errorId: מזהה הודעת השגיאה שמתייחסת לשדה הזה (רק כשהיא מתייחסת אליו). מחבר אותה לשדה לקוראי מסך. */
export function Field({ label, name, type = "text", autoComplete, minLength, errorId }: {
  label: string; name: string; type?: string; autoComplete?: string; minLength?: number; errorId?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input name={name} type={type} autoComplete={autoComplete} minLength={minLength} required aria-invalid={errorId ? true : undefined} aria-describedby={errorId} className={input} />
    </label>
  );
}

export function Submit({ children, pending }: { children: React.ReactNode; pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-60">
      {children}
    </button>
  );
}

export function FormError({ message, id }: { message?: string; id?: string }) {
  return message ? <p id={id} role="alert" className="text-sm text-bad-fg">{message}</p> : null;
}
