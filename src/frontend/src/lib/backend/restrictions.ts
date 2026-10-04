export const DEMO_MESSAGE = 'This feature requires a full MinePanel installation.';
export const INSTALL_URL = 'https://github.com/xst3x/minepanel';
export function notifyUnavailable() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('minepanel:demo-unavailable'));
}
export function unavailable(): never {
  notifyUnavailable();
  throw Object.assign(new Error(DEMO_MESSAGE), { code: 'DEMO_UNAVAILABLE' });
}
