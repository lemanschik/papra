/* eslint-disable antfu/no-top-level-await */
import process, { env } from 'node:process';

import { setupDatabase } from '@papra/app-server/modules/app/database/database.js';
import { ensureLocalDatabaseDirectoryExists } from '@papra/app-server/modules/app/database/database.services.js';
import { createGracefulShutdownService } from '@papra/app-server/modules/app/graceful-shutdown/graceful-shutdown.services.js';
import { createServer } from '@papra/app-server/modules/app/server.js';
import { parseConfig } from '@papra/app-server/modules/config/config.js';
import { createDocumentStorageService } from '@papra/app-server/modules/documents/storage/documents.storage.services.js';
import { createIngestionFolderWatcher } from '@papra/app-server/modules/ingestion-folders/ingestion-folders.usecases.js';
import { createLogger } from '@papra/app-server/modules/shared/logger/logger.js';
import { registerTaskDefinitions } from '@papra/app-server/modules/tasks/tasks.definitions.js';
import { createTaskServices } from '@papra/app-server/modules/tasks/tasks.services.js';

const logger = createLogger({ namespace: 'launcher-main' });

const { config } = await parseConfig({ env });

const isWebMode = config.processMode === 'all' || config.processMode === 'web';
const isWorkerMode = config.processMode === 'all' || config.processMode === 'worker';

logger.info({ processMode: config.processMode, isWebMode, isWorkerMode }, 'Starting application');

// Shutdown callback collector
const shutdownService = createGracefulShutdownService({ logger });
const { registerShutdownHandler } = shutdownService;

export const init = async () => {
  // ENV NODE_ENV=production
  // ENV SERVER_SERVE_PUBLIC_DIR=true
  // ENV DATABASE_URL=file:./app-data/db/db.sqlite
  // ENV DOCUMENT_STORAGE_FILESYSTEM_ROOT=./app-data/documents
  // ENV PAPRA_CONFIG_DIR=./app-data
  // ENV EMAILS_DRY_RUN=true
  // ENV CLIENT_BASE_URL=http://localhost:1221
  
  // # Disable Better Auth telemetry
  // ENV BETTER_AUTH_TELEMETRY=0
  await ensureLocalDatabaseDirectoryExists({ config });
  const { db } = setupDatabase({ ...config.database, registerShutdownHandler });
  
  const documentsStorageService = createDocumentStorageService({ documentStorageConfig: config.documentsStorage });
  
  const taskServices = createTaskServices({ config });
  await taskServices.initialize();
  // Should be maybe only web mode not sure what workers do.
  // found out that processMode all is default and that does both which is great to know  
  
  if (isWorkerMode) {
    if (config.ingestionFolder.isEnabled) {
      const { startWatchingIngestionFolders } = createIngestionFolderWatcher({
        taskServices, config, db, documentsStorageService,
      });
  
      await startWatchingIngestionFolders();
    }
  
    await registerTaskDefinitions({ taskServices, db, config, documentsStorageService });
  
    taskServices.start();
    logger.info('Worker started');
  }

  return {
    taskServices,
    isWorkerMode,
    isWebMode,
    app: isWebMode ? requestHandler(await createServer({ config, db, taskServices, documentsStorageService })) : undefined
  }
}

// handels the browser requests
const requestHandler = ({app}) => interceptedRequest => {
  if (interceptedRequest.isInterceptResolutionHandled()){ return; }
  const method = interceptedRequest.method();
  app.fetch(new Request(
    interceptedRequest.url(),{ 
      method, headers: interceptedRequest.headers(),
      body: (method === 'POST' || method === 'PUT') 
        ? interceptedRequest.fetchPostData() 
        : undefined,
    }
  )).then(res => res.statusCode > 200 
    ? interceptedRequest.respond(res) 
    : interceptedRequest.continoue()
  )
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  setTimeout(() => process.exit(1), 1000); // Give the logger time to flush before exiting
});

process.on('unhandledRejection', (error) => {
  logger.error({ error }, 'Unhandled promise rejection');
  setTimeout(() => process.exit(1), 1000); // Give the logger time to flush before exiting
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, shutting down gracefully...');

  await shutdownService.executeShutdownHandlers();

  logger.info('Shutdown complete, exiting process');
  process.exit(0);
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
