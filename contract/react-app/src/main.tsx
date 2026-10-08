import { ErrorBoundary, identify, initBugLenz } from '@integrall/buglenz-react';
import * as Sentry from '@sentry/react';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calcularTotalPedido, confirmarPedido } from './pedido';

initBugLenz({
  dsn: import.meta.env.VITE_BUGLENZ_DSN as string,
  app: 'contract-web',
  version: '1.0.0',
  environment: 'contract',
  tenant: 't1',
  cliente: 'acme',
});
identify({ id: 'u-1' });

// What a careless app does anyway: the wrapper must still keep it from leaving the browser.
Sentry.setUser({ id: 'u-1', email: 'ana@example.com' });
Sentry.setExtra('password', 'hunter2');
Sentry.addBreadcrumb({ category: 'console', message: 'checkout de ana@example.com' });

function Resumo({ quebrar }: { quebrar: boolean }) {
  if (quebrar) throw new RangeError('resumo do pedido fora do intervalo');
  return <p id="resumo">resumo ok</p>;
}

function App() {
  const [quebrar, setQuebrar] = useState(false);
  return (
    <main>
      <button id="btn-click" type="button" onClick={() => calcularTotalPedido([])}>
        erro no clique
      </button>
      <button id="btn-promise" type="button" onClick={() => void confirmarPedido('42')}>
        promise rejeitada
      </button>
      <button id="btn-render" type="button" onClick={() => setQuebrar(true)}>
        erro de render
      </button>
      <ErrorBoundary fallback={<p id="fallback">falhou</p>}>
        <Resumo quebrar={quebrar} />
      </ErrorBoundary>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
