import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { App } from './App';
import { applyTheme } from './hooks/useTheme';

applyTheme();

// Pide al navegador que no borre IndexedDB por falta de espacio (si lo permite).
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((p) => (p ? undefined : navigator.storage.persist())).catch(() => undefined);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
