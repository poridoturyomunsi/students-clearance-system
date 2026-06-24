import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { registerServiceWorker } from './registerServiceWorker.ts';
import { reportMetric } from './perf/perf';

const startTs = performance.now();
const root = createRoot(document.getElementById('root')!);

async function mountApp() {
  if (typeof window !== 'undefined' && window.location && window.location.pathname === '/_dev_teacher') {
    const { default: TeacherPortal } = await import('./components/TeacherPortal.tsx');
    root.render(
      <StrictMode>
        <TeacherPortal
          teacherId="dev-teacher-1"
          teacherName="Dev Teacher"
          teacherUsername="biirokeneth"
          assignedClasses={["S.4"]}
          assignedSubjects={["Mathematics"]}
          schoolLogo={null}
          onLogout={() => { window.location.href = '/'; }}
        />
      </StrictMode>
    );
  } else {
    const { default: App } = await import('./App.tsx');
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  }

  // Report startup time
  const ms = Math.round(performance.now() - startTs);
  reportMetric('app.startup_ms', ms);
  
  // Signal to Electron that the app is ready (after a brief delay for first render)
  setTimeout(() => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.signalAppReady) {
        (window as any).electronAPI.signalAppReady();
        console.log('✓ App ready signal sent to Electron');
      } else {
        console.log('ℹ electronAPI not available (running in browser mode)');
      }
    } catch (err) {
      console.warn('Error signaling app ready:', err);
    }
  }, 300);
}

mountApp().catch(e => console.error('Failed to mount app', e));

registerServiceWorker();
