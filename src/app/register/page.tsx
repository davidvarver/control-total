import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth-store";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.isPlatformOnly ? "/admin" : "/dashboard");
  }

  const params = await searchParams;

  return (
    <main className="ct-auth-shell min-h-screen text-slate-50">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1fr)]">
        <section className="hidden border-r border-white/10 bg-white/[0.035] px-10 py-12 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="ct-brand-mark flex h-12 w-12 items-center justify-center rounded-lg text-lg font-black text-blue-100">
              CT
            </div>
            <h1 className="ct-brand-title mt-8 text-4xl font-black">
              Empieza ordenado desde el primer dia
            </h1>
            <p className="mt-3 max-w-md text-base font-semibold leading-7 text-slate-400">
              La cuenta que creas aqui sera la cuenta master de la empresa. Despues podras agregar usuarios y roles.
            </p>
          </div>
          <div className="ct-auth-glass rounded-lg p-4 text-sm text-slate-400">
            <p className="font-black text-white">Separacion por empresa</p>
            <p className="mt-1">
              Inventario, ventas, costos, conexiones Meli y permisos quedan aislados de otros clientes.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-10">
          <div className="ct-auth-card w-full max-w-md rounded-lg p-7">
            <p className="text-sm font-black uppercase text-blue-200">
              Registro
            </p>
            <h2 className="mt-3 text-2xl font-black text-white">Crear cuenta</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
              Esta cuenta sera el dueno de una empresa nueva. Todo lo que importes y conectes se queda separado aqui.
            </p>

            {params.error ? (
              <p className="mt-4 rounded-md border border-red-300/25 bg-red-300/10 px-3 py-2 text-sm font-medium text-red-100">
                {params.error}
              </p>
            ) : null}

            <form action="/api/auth/register" method="post" className="mt-5 space-y-4">
              <label className="block text-sm font-bold text-slate-300">
                Tu nombre
                <input
                  name="name"
                  required
                  className="ct-auth-input mt-1 h-11 w-full rounded-md px-3 outline-none"
                />
              </label>
              <label className="block text-sm font-bold text-slate-300">
                Nombre de empresa
                <input
                  name="organizationName"
                  placeholder="Ej. Mi empresa"
                  className="ct-auth-input mt-1 h-11 w-full rounded-md px-3 outline-none"
                />
              </label>
              <label className="block text-sm font-bold text-slate-300">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  className="ct-auth-input mt-1 h-11 w-full rounded-md px-3 outline-none"
                />
              </label>
              <label className="block text-sm font-bold text-slate-300">
                Contrasena
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  className="ct-auth-input mt-1 h-11 w-full rounded-md px-3 outline-none"
                />
              </label>
              <button className="ct-button ct-button-primary h-11 w-full">
                Crear y entrar
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-400">
              Ya tienes cuenta?{" "}
              <Link href="/login" className="font-semibold text-blue-100 hover:underline">
                Entrar
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
