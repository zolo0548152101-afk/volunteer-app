export function AuthShell({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className={`w-full ${wide ? "max-w-xl" : "max-w-sm"} rounded-2xl border border-border p-6`}>
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
