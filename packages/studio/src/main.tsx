import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-mono/latin-400.css';
import './index.css';
import App from './App.tsx';
import { TooltipProvider } from '@/components/ui/tooltip';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={200}>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
