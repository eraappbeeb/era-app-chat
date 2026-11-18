import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({ immediate: true });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    })
    .catch((err) => {
      console.warn('FCM service worker registration failed:', err);
    });
}

createRoot(document.getElementById('root')!).render(<App />);
