import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Debug logs to confirm script is executing
console.log('Starting app mount...');

const rootElement = document.getElementById('root');

if (!rootElement) {
  const msg = "FATAL: Could not find root element with id 'root' in index.html";
  console.error(msg);
  throw new Error(msg);
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('App mounted successfully.');
} catch (error) {
  console.error('Error during app mounting:', error);
}