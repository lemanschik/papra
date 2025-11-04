import { ReadableStream, WriteableStream, TransformStream } from 'node:stream/web';

import {
  setInterval as every,
} from 'node:timers/promises';

import {
  performance,
} from 'node:perf_hooks';

const SECOND = 1000;

const stream = new ReadableStream({
  async start(controller) {
    for await (const _ of every(SECOND))
      controller.enqueue(performance.now());
  },
});

for await (const value of stream) {
  // Start draining here.
  console.log(value);
}

// cd ../..
// pnpm install --frozen-lockfile --ignore-scripts
// pnpm --filter "@papra/app-client..." run build && \
// pnpm --filter "@papra/app-server..." run build
// pnpm deploy --filter=@papra/app-server --legacy --prod packages/desktop/papra-server
// cp apps/papra-client/dist packages/desktop/papra-server/public

// if there is trouble apps/papra-server/src/modules/app/static-assets/static-assets.routes.ts uses hono node-server serve static.

// ENV NODE_ENV=production
// ENV SERVER_SERVE_PUBLIC_DIR=true
// ENV DATABASE_URL=file:./app-data/db/db.sqlite
// ENV DOCUMENT_STORAGE_FILESYSTEM_ROOT=./app-data/documents
// ENV PAPRA_CONFIG_DIR=./app-data
// ENV EMAILS_DRY_RUN=true
// ENV CLIENT_BASE_URL=http://localhost:1221

// # Disable Better Auth telemetry
// ENV BETTER_AUTH_TELEMETRY=0

// RUN mkdir -p ./app-data/db ./app-data/documents ./ingestion

// CMD ["pnpm", "start:with-migrations"]
