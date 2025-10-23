import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { AppProviders } from './providers/AppProviders';
import { router } from './router';
import { initSentry } from './config/sentry';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

initSentry();

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
