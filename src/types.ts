export type IdempotencyState = 'pending' | 'processing' | 'completed' | 'failed';

export interface IdempotencyRecord<T = unknown> {
  key: string;
  scope: string;
  state: IdempotencyState;
  ownerId: string | null;
  leaseExpiresAt: number | null;
  result: T | null;
  error: string | null;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}

export interface AcquireResult<T = unknown> {
  action: 'proceed' | 'replay' | 'busy';
  record?: IdempotencyRecord<T>;
}
