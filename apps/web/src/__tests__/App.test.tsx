import { describe, it, expect } from 'vitest';
import { App } from '../App.js';

describe('App', () => {
  it('exports App component', () => {
    expect(typeof App).toBe('function');
  });
});
