import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './apps/shared/context/ToastContext';
import { AuthProvider } from './apps/shared/hooks/useAuth';
import { PushProvider } from './apps/shared/push/usePush';
import { CartProvider } from './apps/shared/context/CartContext';
import { getRouterBasename } from './apps/shared/lib/baseUrl';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={getRouterBasename()} future={{ v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider>
          <PushProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </PushProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);