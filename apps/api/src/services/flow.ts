import type { PrismaClient } from '@meteorico/database';
import { Prisma } from '@meteorico/database';

const ALLOWED_TRIGGERS = new Set([
  'on_join',
  'on_message',
  'on_keyword',
  'on_classification',
  'on_button',
  'manual',
]);

const ALLOWED_STEP_TYPES = new Set([
  'message',
  'condition',
  'buttons',
  'delay',
  'handoff',
  'classify',
  'end',
]);

const ALLOWED_CONDITION_FIELDS = new Set([
  'classification',
  'totalParticipations',
  'isStudent',
  'optedOut',
  'flowStep',
]);

const ALLOWED_OPERATORS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
]);

export interface FlowCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface FlowStepConfig {
  templateId?: string;
  content?: string;
  condition?: FlowCondition;
  delayMs?: number;
  reason?: string;
  buttons?: Array<{ label: string; value: string; nextStepId?: string }>;
}

export function validateTrigger(trigger: string): boolean {
  return ALLOWED_TRIGGERS.has(trigger);
}

export function validateStepType(stepType: string): boolean {
  return ALLOWED_STEP_TYPES.has(stepType);
}

export function validateCondition(condition: FlowCondition): { valid: boolean; error?: string } {
  if (!ALLOWED_CONDITION_FIELDS.has(condition.field)) {
    return { valid: false, error: `Field not allowed: ${condition.field}` };
  }
  if (!ALLOWED_OPERATORS.has(condition.operator)) {
    return { valid: false, error: `Operator not allowed: ${condition.operator}` };
  }
  return { valid: true };
}

function detectLoop(steps: Array<{ id: string; nextStepId?: string | null; buttons?: Array<{ nextStepId?: string | null }> }>): boolean {
  const visited = new Set<string>();

  function walk(stepId: string, path: Set<string>): boolean {
    if (path.has(stepId)) return true;
    if (visited.has(stepId)) return false;
    visited.add(stepId);
    path.add(stepId);

    const step = steps.find((s) => s.id === stepId);
    if (!step) return false;

    if (step.nextStepId && walk(step.nextStepId, new Set(path))) return true;

    if (step.buttons) {
      for (const btn of step.buttons) {
        if (btn.nextStepId && walk(btn.nextStepId, new Set(path))) return true;
      }
    }

    return false;
  }

  for (const step of steps) {
    if (walk(step.id, new Set())) return true;
  }

  return false;
}

export async function createFlow(
  db: PrismaClient,
  data: { name: string; description: string; trigger: string; createdBy: string },
) {
  if (!validateTrigger(data.trigger)) {
    throw new Error(`Invalid trigger: ${data.trigger}`);
  }

  return db.flowDefinition.create({
    data: {
      name: data.name,
      description: data.description,
      trigger: data.trigger,
      createdBy: data.createdBy,
      versions: {
        create: {
          version: 1,
          isPublished: false,
        },
      },
    },
    include: { versions: true },
  });
}

export async function addStep(
  db: PrismaClient,
  flowVersionId: string,
  data: { stepType: string; config: FlowStepConfig; order: number; nextStepId?: string },
) {
  if (!validateStepType(data.stepType)) {
    throw new Error(`Invalid step type: ${data.stepType}`);
  }

  if (data.stepType === 'condition' && data.config.condition) {
    const check = validateCondition(data.config.condition);
    if (!check.valid) throw new Error(check.error);
  }

  const step = await db.flowStep.create({
    data: {
      flowVersionId,
      order: data.order,
      stepType: data.stepType,
      config: data.config as unknown as Prisma.InputJsonValue,
      nextStepId: data.nextStepId ?? null,
    },
  });

  if (data.config.buttons) {
    for (let i = 0; i < data.config.buttons.length; i++) {
      const btn = data.config.buttons[i];
      await db.flowButton.create({
        data: {
          stepId: step.id,
          label: btn.label,
          value: btn.value,
          nextStepId: btn.nextStepId ?? null,
          order: i,
        },
      });
    }
  }

  return db.flowStep.findUnique({
    where: { id: step.id },
    include: { buttons: { orderBy: { order: 'asc' } } },
  });
}

export async function publishFlow(db: PrismaClient, flowId: string) {
  const latestVersion = await db.flowVersion.findFirst({
    where: { flowId, isPublished: false },
    orderBy: { version: 'desc' },
    include: {
      steps: {
        include: { buttons: true },
      },
    },
  });

  if (!latestVersion) throw new Error('No unpublished version found');

  if (latestVersion.steps.length === 0) throw new Error('Flow has no steps');

  const stepsForLoopCheck = latestVersion.steps.map((s) => ({
    id: s.id,
    nextStepId: s.nextStepId,
    buttons: s.buttons.map((b) => ({ nextStepId: b.nextStepId })),
  }));

  if (detectLoop(stepsForLoopCheck)) {
    throw new Error('Flow contains a cycle');
  }

  return db.flowVersion.update({
    where: { id: latestVersion.id },
    data: {
      isPublished: true,
      publishedAt: new Date(),
    },
  });
}

export async function getFlow(db: PrismaClient, flowId: string) {
  return db.flowDefinition.findUnique({
    where: { id: flowId },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        include: {
          steps: {
            orderBy: { order: 'asc' },
            include: { buttons: { orderBy: { order: 'asc' } } },
          },
        },
      },
    },
  });
}

export async function listFlows(db: PrismaClient, filters?: { isActive?: boolean }) {
  return db.flowDefinition.findMany({
    where: {
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
    },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function newFlowVersion(db: PrismaClient, flowId: string) {
  const latest = await db.flowVersion.findFirst({
    where: { flowId },
    orderBy: { version: 'desc' },
    include: {
      steps: {
        include: { buttons: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  const nextVersion = latest ? latest.version + 1 : 1;

  const newVersion = await db.flowVersion.create({
    data: {
      flowId,
      version: nextVersion,
      isPublished: false,
    },
  });

  if (latest) {
    for (const step of latest.steps) {
      const newStep = await db.flowStep.create({
        data: {
          flowVersionId: newVersion.id,
          order: step.order,
          stepType: step.stepType,
          config: step.config as Prisma.InputJsonValue,
          nextStepId: step.nextStepId,
        },
      });
      for (const btn of step.buttons) {
        await db.flowButton.create({
          data: {
            stepId: newStep.id,
            label: btn.label,
            value: btn.value,
            nextStepId: btn.nextStepId,
            order: btn.order,
          },
        });
      }
    }
  }

  return db.flowVersion.findUnique({
    where: { id: newVersion.id },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: { buttons: { orderBy: { order: 'asc' } } },
      },
    },
  });
}

export { detectLoop };
