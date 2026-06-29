import { describe, it, expect } from 'vitest';
import { VERSION } from './version';

describe('VERSION', () => {
  it('is a semver-ish string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
