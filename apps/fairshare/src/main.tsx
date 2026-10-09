import { createRoot } from 'react-dom/client';
import { App } from './App';
import { enableHaptics } from './haptics';
import { requestPersistence } from './pwa';
import { purgeDeletedTrips } from './store';
import { applyTheme } from './theme';
import './styles.css';

applyTheme();
void requestPersistence();
void purgeDeletedTrips();
enableHaptics();
createRoot(document.getElementById('root')!).render(<App />);
