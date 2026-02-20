import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Debug logs to confirm script is executing
console.log('Starting app mount...');

const rootElement = document.getElementById('root');
console.log('Root element found:', !!rootElement);

if (!rootElement) {
  const msg = "FATAL: Could not find root element with id 'root' in index.html";
  console.error(msg);
  throw new Error(msg);
}

try {
  console.log('Creating React root...');
  const root = ReactDOM.createRoot(rootElement);
  console.log('Root created. Calling root.render()...');
  root.render(
    <App />
  );
  console.log('App mounted successfully.');
} catch (error) {
  console.error('Error during app mounting:', error);
}