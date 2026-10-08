import { createRoot } from 'react-dom/client';
import { App } from './App';
import { enableHaptics } from './haptics';
import { requestPersistence } from './pwa';
import './styles.css';

void requestPersistence();
enableHaptics();
createRoot(document.getElementById('root')!).render(<App />);
