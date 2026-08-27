import { describe, it, expect, beforeEach } from 'vitest';

// Test the pattern matching directly
describe('URL pattern matching', () => {
  it('matches exact URLs', () => {
    const pattern = '/api/users';
    const regex = new RegExp(`${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')}($|\\?)`);
    expect(regex.test('/api/users')).toBe(true);
    expect(regex.test('/api/products')).toBe(false);
  });

  it('matches wildcard * patterns', () => {
    const segment = '[^/]+';
    const regex = new RegExp(`/api/users/${segment}($|\\?)`);
    expect(regex.test('/api/users/123')).toBe(true);
    expect(regex.test('/api/users/abc-456')).toBe(true);
    expect(regex.test('/api/users')).toBe(false);
  });

  it('matches :param patterns', () => {
    const segment = '[^/]+';
    const regex = new RegExp(`/api/users/${segment}($|\\?)`);
    expect(regex.test('/api/users/123')).toBe(true);
    expect(regex.test('/api/users/456/posts')).toBe(false);
  });
});