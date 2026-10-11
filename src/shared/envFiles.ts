/** File names the extension treats as dotenv files: `.env`, `.env.local`, `production.env`, … */
const ENV_FILE_RE = /(^\.env(\..+)?$)|(\.env$)/;

export function isEnvFileName(name: string): boolean {
  return ENV_FILE_RE.test(name);
}
