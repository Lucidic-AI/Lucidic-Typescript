const envTrue = (v?: string | null) => /^(true|1)$/i.test(String(v ?? ''));

export const DEBUG = envTrue(process.env.LUCIDIC_DEBUG);
export const VERBOSE = envTrue(process.env.LUCIDIC_VERBOSE);

export function debug(message: string, ...meta: any[]) {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.debug(`[Lucidic][DEBUG] ${message}`, ...meta);
  }
}

export function info(message: string, ...meta: any[]) {
  if (DEBUG || VERBOSE) {
    // eslint-disable-next-line no-console
    console.log(`[Lucidic][INFO] ${message}`, ...meta);
  }
}

export function warn(message: string, ...meta: any[]) {
  if (DEBUG || VERBOSE) {
    // eslint-disable-next-line no-console
    console.warn(`[Lucidic][WARN] ${message}`, ...meta);
  }
}

export function error(message: string, ...meta: any[]) {
  // Always show errors (essential logs)
  // eslint-disable-next-line no-console
  console.error(`[Lucidic][ERROR] ${message}`, ...meta);
}

