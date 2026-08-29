import { describe, it, expect } from 'vitest';
import { StatusBadge } from '../StatusBadge.js';

describe('StatusBadge', () => {
  it('is a function', () => {
    expect(typeof StatusBadge).toBe('function');
  });

  it('can be imported from the package index', async () => {
    const mod = await import('../index.js');
    expect(typeof mod.StatusBadge).toBe('function');
  });
});
