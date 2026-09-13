import { createApplication } from '@/application';
import { startApplication } from '@/startApplication';
import { createE2EDiagnosticsPlugin } from './e2eDiagnostics';
import '@/applicationStyles';

export const application = createApplication({
  configureApp: (app, { applicationStore }) => {
    app.use(createE2EDiagnosticsPlugin({ applicationStore }));
  },
});

export const applicationRuntime = startApplication({ application });
