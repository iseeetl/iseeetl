import { createApplication, createStoreAdapters } from './application';
import { startApplication } from './startApplication';
import './applicationStyles';

export { createApplication, createStoreAdapters };

export const application = createApplication();
export const applicationRuntime = startApplication({ application });
