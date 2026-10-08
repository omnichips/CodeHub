import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistence } from './pwa';
import './styles.css';

void requestPersistence();
createRoot(document.getElementById('root')!).render(<App />);
