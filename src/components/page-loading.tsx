export function PageLoading({ title = "Cargando" }: { title?: string }) {
  return (
    <main className="ct-dark-app min-h-screen overflow-hidden text-white">
      <aside className="ct-sidebar-shell fixed inset-y-0 left-0 z-10 hidden w-[320px] px-6 py-8 lg:block">
        <div className="flex items-center gap-3">
          <div className="ct-brand-mark h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <div className="h-5 w-36 animate-pulse rounded-full bg-white/[0.12]" />
            <div className="h-2.5 w-28 animate-pulse rounded-full bg-white/[0.08]" />
          </div>
        </div>
        <div className="mt-12 space-y-8">
          {[0, 1].map((group) => (
            <div key={group} className="space-y-3">
              <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/[0.08]" />
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-12 animate-pulse rounded-full border border-white/10 bg-white/[0.045]"
                />
              ))}
            </div>
          ))}
        </div>
        <div className="absolute bottom-8 left-6 right-6 h-24 animate-pulse rounded-[26px] border border-white/10 bg-white/[0.05]" />
      </aside>

      <div className="lg:ml-[320px]">
        <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#07080d]/80 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3">
            <div className="h-12 w-full max-w-[360px] animate-pulse rounded-full border border-white/10 bg-white/[0.055]" />
            <div className="flex gap-3">
              <div className="h-12 w-32 animate-pulse rounded-full bg-white/[0.08]" />
              <div className="h-12 w-44 animate-pulse rounded-full bg-white/[0.06]" />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1720px] space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <section className="ct-dashboard-hero grid min-h-[260px] gap-6 p-7 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="h-3 w-36 animate-pulse rounded-full bg-[var(--ct-cyan)]/35" />
              <div className="h-14 w-full max-w-[620px] animate-pulse rounded-[24px] bg-white/[0.1]" />
              <div className="h-5 w-full max-w-[720px] animate-pulse rounded-full bg-white/[0.07]" />
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--ct-cyan)]">
                {title}
              </p>
            </div>
            <div className="hidden rounded-[28px] border border-white/10 bg-white/[0.05] p-4 lg:block">
              <div className="grid h-full grid-cols-3 gap-3">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="animate-pulse rounded-[22px] border border-white/10 bg-white/[0.055]"
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="ct-ops-kpi animate-pulse" />
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="ct-dashboard-panel min-h-[360px] p-5">
              <div className="h-7 w-56 animate-pulse rounded-full bg-white/[0.1]" />
              <div className="mt-8 space-y-4">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-16 animate-pulse rounded-[22px] bg-white/[0.055]"
                  />
                ))}
              </div>
            </div>
            <div className="ct-dashboard-danger-panel min-h-[360px] p-5">
              <div className="h-7 w-44 animate-pulse rounded-full bg-white/[0.1]" />
              <div className="mt-8 space-y-4">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-14 animate-pulse rounded-[22px] bg-white/[0.06]"
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
