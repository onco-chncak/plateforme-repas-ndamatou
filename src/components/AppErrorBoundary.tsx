import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class AppErrorBoundary extends Component<Props, State> {
  declare props: Readonly<Props>;
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Erreur inconnue' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application rendering error:', error, info);
  }

  private recover = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const lowerMessage = this.state.message.toLowerCase();
    const isQuotaError = lowerMessage.includes('quota') || lowerMessage.includes('resource-exhausted');

    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white flex items-center justify-center">
        <section className="w-full max-w-xl rounded-3xl border border-red-400/40 bg-slate-900 p-7 text-center shadow-2xl">
          <TriangleAlert className="mx-auto h-16 w-16 text-amber-400" />
          <h1 className="mt-5 text-2xl font-black">
            {isQuotaError ? 'Firebase est temporairement saturé' : "L'application doit être actualisée"}
          </h1>
          <p className="mt-3 text-sm font-bold text-slate-300">
            {isQuotaError
              ? "Le téléphone n'a pas pu lire certaines données Firebase à cause d'une limite temporaire. Vos commandes et votre solde ne sont pas supprimés."
              : "Une erreur d'affichage a été détectée. Vos commandes et votre solde enregistrés dans Firebase ne sont pas supprimés."}
          </p>
          <p className="mt-3 rounded-xl bg-black/30 p-3 text-xs text-slate-400">{this.state.message}</p>
          <button type="button" onClick={this.recover} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-950">
            <RefreshCw className="h-5 w-5" />
            Actualiser et récupérer l'application
          </button>
        </section>
      </main>
    );
  }
}
