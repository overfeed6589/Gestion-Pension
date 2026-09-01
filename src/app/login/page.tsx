import { login } from './action';

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  // Gestion asynchrone des searchParams (Next.js 15)
  const params = await searchParams;
  const errorMessage = params.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        
        {/* En-tête */}
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Espace Gestionnaire
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Connectez-vous pour accéder au tableau de bord de la pension
          </p>
        </div>

        {/* Bannière d'erreur dynamiquement affichée si passée dans l'URL */}
        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
            {errorMessage}
          </div>
        )}

        {/* Formulaire relié à la Server Action */}
        <form action={login} className="space-y-4">
          <div className="space-y-2">
            <label 
              htmlFor="email" 
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Adresse e-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="gerant@pension.fr"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="space-y-2">
            <label 
              htmlFor="password" 
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}