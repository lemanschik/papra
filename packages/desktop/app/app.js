/* eslint-disable antfu/no-top-level-await */
import process, { env } from 'node:process';
import { serve } from '@hono/node-server';
// . === papra/apps/papra-server
import { setupDatabase } from '@papra/app-server/modules/app/database/database';
import { ensureLocalDatabaseDirectoryExists } from '@papra/app-server/modules/app/database/database.services';
import { createGracefulShutdownService } from '@papra/app-server/modules/app/graceful-shutdown/graceful-shutdown.services';
import { createServer } from '@papra/app-server/modules/app/server';
import { parseConfig } from '@papra/app-server/modules/config/config';
import { createDocumentStorageService } from '@papra/app-server/modules/documents/storage/documents.storage.services';
import { createIngestionFolderWatcher } from '@papra/app-server/modules/ingestion-folders/ingestion-folders.usecases';
import { createLogger } from '@papra/app-server/modules/shared/logger/logger';
import { registerTaskDefinitions } from '@papra/app-server/modules/tasks/tasks.definitions';
import { createTaskServices } from '@papra/app-server/modules/tasks/tasks.services';

const logger = createLogger({ namespace: 'app-server' });

const { config } = await parseConfig({ env });

const isWebMode = config.processMode === 'all' || config.processMode === 'web';
const isWorkerMode = config.processMode === 'all' || config.processMode === 'worker';

logger.info({ processMode: config.processMode, isWebMode, isWorkerMode }, 'Starting application');

// Shutdown callback collector
const shutdownService = createGracefulShutdownService({ logger });
const { registerShutdownHandler } = shutdownService;

await ensureLocalDatabaseDirectoryExists({ config });
const { db } = setupDatabase({ ...config.database, registerShutdownHandler });

const documentsStorageService = createDocumentStorageService({ documentStorageConfig: config.documentsStorage });

const taskServices = createTaskServices({ config });
await taskServices.initialize();
// Should be maybe only web mode not sure what workers do.
// found out that processMode all is default and that does both which is great to know
if (isWebMode) {
  const { app } = await createServer({ config, db, taskServices, documentsStorageService });

    if (interceptedRequest.isInterceptResolutionHandled()){ return; }
    
    // 1. Get the URL and Method
      app.fetch(new Request(
        interceptedRequest.url(),{ 
          method: interceptedRequest.method(), 
          headers: interceptedRequest.headers(),
          body: (method === 'POST' || method === 'PUT') 
            ? interceptedRequest.fetchPostData() 
            : undefined,
        }
      )).then(res => res.statusCode > 200 
        ? interceptedRequest.respond(res) 
        : interceptedRequest.continoue()
      )
}

if (isWorkerMode) {
  if (config.ingestionFolder.isEnabled) {
    const { startWatchingIngestionFolders } = createIngestionFolderWatcher({
      taskServices,
      config,
      db,
      documentsStorageService,
    });

    await startWatchingIngestionFolders();
  }

  await registerTaskDefinitions({ taskServices, db, config, documentsStorageService });

  taskServices.start();
  logger.info('Worker started');
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
