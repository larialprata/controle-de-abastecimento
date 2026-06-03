import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Erro desconhecido" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-red-300/80 bg-red-50/95 p-6 text-red-900 shadow-lg backdrop-blur-md dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-100"
        >
          <h2 className="text-lg font-bold">Algo correu mal nesta área</h2>
          <p className="mt-2 text-sm opacity-90">
            Se estava a abrir o mapa, experimente recarregar a página (F5) ou verificar a consola do
            browser.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-black/5 p-3 text-xs dark:bg-black/20">
            {this.state.message}
          </pre>
          <button
            type="button"
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
