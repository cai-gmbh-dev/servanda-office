import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { NotificationProvider } from './hooks/useNotifications';
import { NotificationToast } from './components/NotificationToast';
import './index.css';
import './styles/responsive.css';
import './styles/changelog-panel.css';
import './styles/notifications.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NotificationProvider>
        <App />
        <NotificationToast />
      </NotificationProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
