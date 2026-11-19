export function debugModeEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.MODE === 'debug';
}
