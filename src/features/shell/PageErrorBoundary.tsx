// Shell resilience (Phase 10 UAT round 1, owner report 2026-10-24: "clicking
// on the tab Destaques makes the whole UI vanish").
//
// A render-time throw in any page used to unmount the ENTIRE tree — header,
// nav and all — leaving a blank screen with no way to navigate out. The tab
// switch now mounts each page inside this boundary, so a broken page is
// contained to the content region and the shell stays usable. The boundary is
// keyed by tab in App, so choosing another tab (or retrying) remounts it.
//
// Scope: render/lifecycle errors ONLY. Data, auth and validation failures are
// already handled inside each page (generic pt-BR copy, never HTTP internals);
// this is the last-resort net, not a replacement for that handling.
import { Component, type ErrorInfo, type ReactNode } from 'react'

const FALLBACK_MESSAGE =
  'Algo deu errado ao carregar esta página. Tente novamente ou escolha outra aba.'

type PageErrorBoundaryProps = { children: ReactNode }
type PageErrorBoundaryState = { failed: boolean }

export class PageErrorBoundary extends Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  state: PageErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): PageErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Dev-only diagnostics (same convention as the OCR pipeline): production
    // users see the friendly copy, never a stack trace.
    if (import.meta.env?.DEV) {
      console.error('[shell] page render failed:', error, info.componentStack)
    }
  }

  private retry = () => {
    this.setState({ failed: false })
  }

  render() {
    if (this.state.failed) {
      return (
        <section
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-line bg-surface p-6"
        >
          <p className="text-sm font-semibold text-error">{FALLBACK_MESSAGE}</p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-3 h-11 rounded-md border border-line px-4 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Tentar novamente
          </button>
        </section>
      )
    }
    return this.props.children
  }
}
