import type { JobView, Money, SourceDescriptor } from '@foi/domain';

export interface SystemInfo {
  version: string;
  fixtureMode: boolean;
  warnings: string[];
  dataLocation: string;
  budget: { monthlyHardCap: Money; spentThisMonth: Money };
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  details: Record<string, unknown>;
}

export type { JobView, SourceDescriptor };
