
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Debug log to confirm script execution in console
console.log('App starting...');

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('Failed to find the root element');
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('App mounted.');
