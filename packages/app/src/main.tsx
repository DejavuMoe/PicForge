import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/geist-fonts.css';
import './app-shell.css';
import './i18n';
import App from './App';
import { registerServiceWorker } from './registerServiceWorker';
import { ThemeProvider } from './contexts/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

registerServiceWorker();
