import { describe, expect, it } from 'vitest';
import { importProgress, validImportSize, formatImportBytes } from './importProgress';

describe('large server import progress', () => {
  it.each([2, 10, 50, 100, 1000])('accepts %s GiB without a payload cap', gib => {
    expect(validImportSize(gib * 1024 ** 3)).toBe(true);
  });
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid sizes %s', size => {
    expect(validImportSize(size)).toBe(false);
  });
  it('keeps accurate bytes, percentage and average speed above 32-bit sizes', () => {
    const total = 100 * 1024 ** 3;
    const result = importProgress({ loaded: total / 2, total, lengthComputable: true }, 1000, 101000);
    expect(result).toEqual({ loaded: total / 2, total, pct: 50, speed: total / 200, label: 'Uploading...' });
    expect(formatImportBytes(result.loaded)).toBe('50.00 GiB');
  });
  it('does not enter extraction before all bytes have uploaded', () => {
    expect(importProgress({ loaded: 999, total: 1000, lengthComputable: true }, 0, 100).label).toBe('Uploading...');
    expect(importProgress({ loaded: 1000, total: 1000, lengthComputable: true }, 0, 100).label).toBe('Extracting & configuring...');
  });
  it('handles unknown totals and zero elapsed time without NaN or infinity', () => {
    expect(importProgress({ loaded: 123, total: 0, lengthComputable: false }, 0, 0)).toMatchObject({ loaded: 123, total: null, pct: 0, speed: 0 });
  });
});
