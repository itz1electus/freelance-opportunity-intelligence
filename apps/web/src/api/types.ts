import type { JobView, Money, SourceDescriptor } from '@foi/domain';

export interface SharedStatus {
  state: 'ok' | 'changed_externally' | 'invalid';
  problem: { file: string; message: string } | null;
  notice: string | null;
  exportError: string | null;
}

export interface SystemInfo {
  version: string;
  fixtureMode: boolean;
  warnings: string[];
  dataLocation: string;
  partnersProvisioned: boolean;
  shared: SharedStatus;
  budget: { monthlyHardCap: Money; spentThisMonth: Money };
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  details: Record<string, unknown>;
}

export type { JobView, SourceDescriptor };
