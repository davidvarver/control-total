export function PageLoading({ title = "Cargando" }: { title?: string }) {
  return (
    <main className="min-h-screen bg-[#050812] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <div className="h-16 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.06]" />
        <section className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.06]"
            />
          ))}
        </section>
        <section className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
          <p className="text-sm font-black uppercase text-slate-300">{title}</p>
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-10 animate-pulse rounded-2xl bg-white/[0.08]" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
