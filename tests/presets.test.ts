import { describe, expect, it } from 'vitest';
import { findPreset, isLikelyApiKey, normalizeBaseUrl } from '@/lib/config/presets';

describe('presets', () => {
  it('finds a preset by id', () => {
    expect(findPreset('deepseek')?.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(findPreset('missing')).toBeUndefined();
  });

  it('normalizes trailing slashes', () => {
    expect(normalizeBaseUrl(' https://api.example.com/v1/// ')).toBe('https://api.example.com/v1');
  });

  it('rejects obviously short keys', () => {
    expect(isLikelyApiKey('short')).toBe(false);
    expect(isLikelyApiKey('sk-1234567890')).toBe(true);
  });
});
