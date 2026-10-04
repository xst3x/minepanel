// Local fallback also keeps the demo independent of external skin services.
export const fallbackSkin = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 112"><g stroke="#253b31" stroke-width="1"><path fill="#a8c9ad" d="M20 4l22 4v24l-22-4z"/><path fill="#6b9473" d="M42 8l10-4v24l-10 4z"/><path fill="#d5e6d4" d="M20 4L30 0l22 4-10 4z"/><path fill="#387969" d="M20 30l22 4v36l-22-4z"/><path fill="#255849" d="M42 34l10-5v36l-10 5z"/><path fill="#a8c9ad" d="M9 28l10 3v39L9 67zm44 4l9-4v38l-9 5z"/><path fill="#4f637d" d="M20 67l10 2v39l-10-2zm12 3l10 2v39l-10-2z"/><path fill="#37495c" d="M42 72l10-5v39l-10 5z"/><path fill="#253b31" d="M25 15h4v4h-4zm10 2h4v4h-4zm-7 7l9 1v3l-9-1z"/></g></svg>`);

export function playerSkinUrl(name?: string, uuid?: string) {
  const subject = name && /^[A-Za-z0-9_]{1,16}$/.test(name) ? name
    : uuid && /^[0-9a-f]{32}$/i.test(uuid.replace(/-/g, '')) ? uuid.replace(/-/g, '') : 'X-Steve';
  return `https://vzge.me/full/256/${encodeURIComponent(subject)}?autocrop`;
}
