import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../editor/i18n';
import { LiveApp } from './LiveApp';
import './live.css';
import { reopenLastProject } from './LiveProjectPicker';
// fork: reopen the last project when Live is opened without ?project= (src/live/LiveProjectPicker.tsx)
if (!reopenLastProject()) createRoot(document.getElementById('root')!).render(<I18nProvider><LiveApp /></I18nProvider>);
