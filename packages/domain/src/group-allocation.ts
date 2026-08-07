import type { Segment, GroupStatus } from '@meteorico/shared';

export interface GroupCandidate {
  id: string;
  segment: Segment;
  status: GroupStatus;
  currentMembers: number;
  maxMembers: number;
  priority: number;
}

/**
 * Allocates a contact to the best available group for the given segment.
 *
 * Filters by segment and active status, then sorts by priority (ascending)
 * and available capacity (descending). Returns the top candidate, or null
 * if no group has capacity.
 */
export function allocateGroup(groups: GroupCandidate[], segment: Segment): GroupCandidate | null {
  const eligible = groups.filter(
    (g) => g.segment === segment && g.status === 'ATIVO' && g.currentMembers < g.maxMembers,
  );

  if (eligible.length === 0) {
    return null;
  }

  eligible.sort((a, b) => {
    // Lower priority number = higher priority
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // More available capacity first
    const capacityA = a.maxMembers - a.currentMembers;
    const capacityB = b.maxMembers - b.currentMembers;
    return capacityB - capacityA;
  });

  return eligible[0];
}
