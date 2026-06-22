import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled UI error:", error);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="max-w-xl mx-auto px-6 pt-16 pb-6 text-ink">
        <h1 className="font-serif text-3xl mb-2">Something went wrong</h1>
        <p className="text-ink-light text-base mb-6">
          The page hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="px-4 py-2 bg-olive text-cream rounded-lg font-medium text-sm hover:bg-olive-light transition-colors"
        >
          Reload
        </button>
      </div>
    );
  }
}
