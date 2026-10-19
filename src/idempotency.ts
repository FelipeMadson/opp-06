import type { IdempotencyRecord, AcquireResult } from './types.ts';

export class IdempotencyGuard {
  private records = new Map<string, IdempotencyRecord>();

  private compositeKey(scope: string, key: string): string {
    return `${scope}::${key}`;
  }

  acquire<T = unknown>(scope: string, key: string, ownerId: string, leaseDurationMs = 30000): AcquireResult<T> {
    const composite = this.compositeKey(scope, key);
    const now = Date.now();
    const existing = this.records.get(composite);

    if (!existing) {
      const rec: IdempotencyRecord = {
        key,
        scope,
        state: 'processing',
        ownerId,
        leaseExpiresAt: now + leaseDurationMs,
        result: null,
        error: null,
        attempts: 1,
        createdAt: now,
        updatedAt: now
      };
      this.records.set(composite, rec);
      return { action: 'proceed', record: { ...(rec as IdempotencyRecord<T>) } };
    }

    // Já concluído: replay do resultado idempotente!
    if (existing.state === 'completed') {
      return { action: 'replay', record: { ...(existing as IdempotencyRecord<T>) } };
    }

    // Em processamento por outro worker com lease ativo: recurso ocupado
    if (existing.state === 'processing' && existing.leaseExpiresAt && existing.leaseExpiresAt > now) {
      if (existing.ownerId === ownerId) {
        // Mesmo owner renovando o lease
        existing.leaseExpiresAt = now + leaseDurationMs;
        existing.updatedAt = now;
        return { action: 'proceed', record: { ...(existing as IdempotencyRecord<T>) } };
      }
      return { action: 'busy', record: { ...(existing as IdempotencyRecord<T>) } };
    }

    // Se o worker anterior desconectou (lease expirou) ou falhou: re-adquirir
    existing.state = 'processing';
    existing.ownerId = ownerId;
    existing.leaseExpiresAt = now + leaseDurationMs;
    existing.attempts += 1;
    existing.updatedAt = now;

    return { action: 'proceed', record: { ...(existing as IdempotencyRecord<T>) } };
  }

  complete<T = unknown>(scope: string, key: string, ownerId: string, result: T): void {
    const composite = this.compositeKey(scope, key);
    const existing = this.records.get(composite);

    if (!existing) {
      throw new Error(`Registro de idempotência não encontrado: ${composite}`);
    }
    if (existing.ownerId !== ownerId) {
      throw new Error(`Conflito de posse: tentativa de concluir por ${ownerId}, mas o lease pertence a ${existing.ownerId}`);
    }

    existing.state = 'completed';
    existing.result = result;
    existing.leaseExpiresAt = null;
    existing.updatedAt = Date.now();
  }

  fail(scope: string, key: string, ownerId: string, error: string): void {
    const composite = this.compositeKey(scope, key);
    const existing = this.records.get(composite);

    if (!existing) {
      throw new Error(`Registro de idempotência não encontrado: ${composite}`);
    }
    if (existing.ownerId !== ownerId) {
      throw new Error(`Conflito de posse: tentativa de falhar por ${ownerId}, mas o lease pertence a ${existing.ownerId}`);
    }

    existing.state = 'failed';
    existing.error = error;
    existing.leaseExpiresAt = null;
    existing.updatedAt = Date.now();
  }

  getRecord<T = unknown>(scope: string, key: string): IdempotencyRecord<T> | undefined {
    const r = this.records.get(this.compositeKey(scope, key));
    return r ? ({ ...r } as IdempotencyRecord<T>) : undefined;
  }
}
