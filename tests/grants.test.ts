import { describe, expect, it } from 'vitest';
import { grantKeyOf, isGranted, originOfUrl, withGrant } from '@/lib/agent/grants';

describe('grant keys', () => {
  it('scopes a grant to one site and one tool', () => {
    const key = { origin: 'https://shop.example.com', toolName: 'read_tab' };
    expect(grantKeyOf(key)).toBe('https://shop.example.com::read_tab');
    expect(isGranted([grantKeyOf(key)], key)).toBe(true);
    expect(isGranted([grantKeyOf(key)], { origin: key.origin, toolName: 'click' })).toBe(false);
    expect(isGranted([grantKeyOf(key)], null)).toBe(false);
  });

  it('adds a grant once', () => {
    const key = { origin: 'https://a.com', toolName: 'read_tab' };
    const once = withGrant([], key);
    expect(withGrant(once, key)).toEqual(once);
    expect(once).toHaveLength(1);
  });
});

describe('originOfUrl', () => {
  it('keeps only ordinary web origins', () => {
    expect(originOfUrl('https://a.com/x/y?q=1')).toBe('https://a.com');
    expect(originOfUrl('http://localhost:3000/probe')).toBe('http://localhost:3000');
    expect(originOfUrl('chrome://extensions')).toBeNull();
    expect(originOfUrl('chrome-extension://abc/panel.html')).toBeNull();
    expect(originOfUrl('')).toBeNull();
    expect(originOfUrl(undefined)).toBeNull();
  });
});
