import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles.css';

// Sentry disabled in open-source build
// To enable, uncomment and set SENTRY_DSN in main process
console.log('[OpenSource] Sentry disabled in renderer');

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}