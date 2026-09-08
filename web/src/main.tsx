import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './apps/shared/context/ToastContext';
import { AuthProvider } from './apps/shared/hooks/useAuth';
import { PushProvider } from './apps/shared/push/usePush';
import { CartProvider } from './apps/shared/context/CartContext';
import { getRouterBasename } from './apps/shared/lib/baseUrl';
import { registerNativeBackButton } from './apps/shared/lib/nativeBackButton';
import App from './App';
import './index.css';

// Android's back button, before the router mounts, so the very first back press
// is handled. No-op in a browser.
registerNativeBackButton();

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