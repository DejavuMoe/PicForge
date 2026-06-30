import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="pf-error-fallback">
        <div className="pf-error-card">
          <div className="pf-error-icon" aria-hidden="true">
            <FiAlertTriangle size={24} />
          </div>
          <p className="pf-error-title">{i18n.t('errorBoundary.title')}</p>
          <p className="pf-error-copy">{i18n.t('errorBoundary.copy')}</p>
          {this.state.error && <pre className="pf-error-message">{this.state.error.message}</pre>}
          <button
            type="button"
            className="pf-error-button"
            onClick={() => window.location.reload()}
          >
            {i18n.t('errorBoundary.reload')}
          </button>
        </div>
      </div>
    );
  }
}
