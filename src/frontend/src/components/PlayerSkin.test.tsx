import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerSkin from './PlayerSkin';
import { fallbackSkin, playerSkinUrl } from '../lib/playerSkin';
import { assetUrl } from '../lib/backend/mock';

afterEach(cleanup);
describe('player skin renders', () => {
  it('uses a valid username for offline UUIDs and displays a local fallback on service failure', () => {
    render(<PlayerSkin name="Notch" uuid="550e8400-e29b-41d4-a716-446655440001" large />);
    const image = screen.getByRole('img', { name: "Notch's 3D skin" });
    expect(image.getAttribute('src')).toBe('https://vzge.me/full/256/Notch?autocrop');
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe(fallbackSkin);
  });
  it('falls back to a valid UUID or built-in skin for invalid names', () => {
    expect(playerSkinUrl('unknown name', '550e8400-e29b-41d4-a716-446655440001')).toContain('/550e8400e29b41d4a716446655440001?');
    expect(playerSkinUrl('../../escape')).toContain('/X-Steve?');
  });
  it('keeps demo skin images entirely local', () => {
    expect(assetUrl(playerSkinUrl('Notch'))).toBe(fallbackSkin);
  });
});
