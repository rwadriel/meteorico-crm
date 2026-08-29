import { describe, it, expect } from 'vitest';
import { allocateGroup, type GroupCandidate } from '../group-allocation.js';

function makeGroup(overrides: Partial<GroupCandidate> = {}): GroupCandidate {
  return {
    id: 'g1',
    segment: 'NOVO',
    status: 'ATIVO',
    currentMembers: 0,
    maxMembers: 100,
    priority: 1,
    ...overrides,
  };
}

describe('allocateGroup', () => {
  it('allocates to the highest priority group with capacity', () => {
    const groups: GroupCandidate[] = [
      makeGroup({ id: 'g1', priority: 2, currentMembers: 10 }),
      makeGroup({ id: 'g2', priority: 1, currentMembers: 50 }),
      makeGroup({ id: 'g3', priority: 3, currentMembers: 0 }),
    ];

    const result = allocateGroup(groups, 'NOVO');
    expect(result?.id).toBe('g2');
  });

  it('prefers more capacity when priority is the same', () => {
    const groups: GroupCandidate[] = [
      makeGroup({ id: 'g1', priority: 1, currentMembers: 80, maxMembers: 100 }),
      makeGroup({ id: 'g2', priority: 1, currentMembers: 20, maxMembers: 100 }),
    ];

    const result = allocateGroup(groups, 'NOVO');
    expect(result?.id).toBe('g2');
  });

  it('returns null when all groups are full', () => {
    const groups: GroupCandidate[] = [
      makeGroup({ id: 'g1', currentMembers: 100, maxMembers: 100 }),
      makeGroup({ id: 'g2', currentMembers: 50, maxMembers: 50 }),
    ];

    const result = allocateGroup(groups, 'NOVO');
    expect(result).toBeNull();
  });

  it('filters by segment', () => {
    const groups: GroupCandidate[] = [
      makeGroup({ id: 'g1', segment: 'NOVO', priority: 1 }),
      makeGroup({ id: 'g2', segment: 'VETERANO', priority: 1 }),
      makeGroup({ id: 'g3', segment: 'REPARTICIPANTE', priority: 1 }),
    ];

    const result = allocateGroup(groups, 'VETERANO');
    expect(result?.id).toBe('g2');
  });

  it('excludes inactive groups', () => {
    const groups: GroupCandidate[] = [
      makeGroup({ id: 'g1', status: 'INATIVO', priority: 1 }),
      makeGroup({ id: 'g2', status: 'LOTADO', priority: 1 }),
      makeGroup({ id: 'g3', status: 'ATIVO', priority: 2 }),
    ];

    const result = allocateGroup(groups, 'NOVO');
    expect(result?.id).toBe('g3');
  });

  it('returns null for an empty group list', () => {
    const result = allocateGroup([], 'NOVO');
    expect(result).toBeNull();
  });

  it('returns null when no group matches the segment', () => {
    const groups: GroupCandidate[] = [
      makeGroup({ id: 'g1', segment: 'NOVO' }),
    ];

    const result = allocateGroup(groups, 'ALUNO');
    expect(result).toBeNull();
  });
});
