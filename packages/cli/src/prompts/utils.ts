import process from 'node:process';
import { cancel, isCancel } from '@clack/prompts';

export async function exitOnCancel<T>(promise: Promise<T | symbol>): Promise<T> {
  const value = await promise;

  if (isCancel(value)) {
    exit('Operation cancelled');
  }

  return value;
}

export function exit(message: string): never {
  cancel(message);
  process.exit(1);
}
