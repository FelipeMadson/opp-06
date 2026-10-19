import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IdempotencyGuard } from '../src/idempotency.ts';

describe('IdempotencyGuard', () => {
  it('permite a primeira execução para uma chave inédita', () => {
    const guard = new IdempotencyGuard();
    const res = guard.acquire('payments', 'pay_tx_1001', 'worker-1');

    assert.equal(res.action, 'proceed');
    assert.equal(res.record?.state, 'processing');
    assert.equal(res.record?.ownerId, 'worker-1');
    assert.equal(res.record?.attempts, 1);
  });

  it('bloqueia concorrência enquanto outro worker processa com lease válido', () => {
    const guard = new IdempotencyGuard();
    guard.acquire('payments', 'pay_tx_1002', 'worker-1', 60000);

    const concurrent = guard.acquire('payments', 'pay_tx_1002', 'worker-2');
    assert.equal(concurrent.action, 'busy');
    assert.equal(concurrent.record?.ownerId, 'worker-1');
  });

  it('permite renovação de lease pelo mesmo worker', () => {
    const guard = new IdempotencyGuard();
    const first = guard.acquire('payments', 'pay_tx_1003', 'worker-1', 10000);
    const renewed = guard.acquire('payments', 'pay_tx_1003', 'worker-1', 20000);

    assert.equal(first.action, 'proceed');
    assert.equal(renewed.action, 'proceed');
    assert.ok((renewed.record?.leaseExpiresAt ?? 0) >= (first.record?.leaseExpiresAt ?? 0));
  });

  it('re-executa e incrementa tentativas quando o lease anterior expira (crash do worker)', () => {
    const guard = new IdempotencyGuard();
    // Lease já expirado (-1000ms)
    guard.acquire('payments', 'pay_tx_1004', 'worker-crashed', -1000);

    const recovery = guard.acquire('payments', 'pay_tx_1004', 'worker-standby', 30000);
    assert.equal(recovery.action, 'proceed');
    assert.equal(recovery.record?.ownerId, 'worker-standby');
    assert.equal(recovery.record?.attempts, 2);
  });

  it('armazena resultado e retorna replay para requisições idempotentes subsequentes', () => {
    const guard = new IdempotencyGuard();
    guard.acquire<{ transactionId: string; amount: number }>('payments', 'pay_tx_1005', 'worker-1');

    guard.complete('payments', 'pay_tx_1005', 'worker-1', {
      transactionId: 'ch_999888',
      amount: 450.00
    });

    const secondCall = guard.acquire<{ transactionId: string; amount: number }>('payments', 'pay_tx_1005', 'worker-api');
    assert.equal(secondCall.action, 'replay');
    assert.deepEqual(secondCall.record?.result, {
      transactionId: 'ch_999888',
      amount: 450.00
    });
  });

  it('impede que worker não autorizado finalize ou altere o lease', () => {
    const guard = new IdempotencyGuard();
    guard.acquire('payments', 'pay_tx_1006', 'worker-legit');

    assert.throws(
      () => guard.complete('payments', 'pay_tx_1006', 'worker-imposter', { ok: true }),
      /Conflito de posse/
    );

    assert.throws(
      () => guard.fail('payments', 'pay_tx_1006', 'worker-imposter', 'Falha simulada'),
      /Conflito de posse/
    );
  });

  it('permite re-tentativa quando um job foi marcado explicitamente como falhado', () => {
    const guard = new IdempotencyGuard();
    guard.acquire('payments', 'pay_tx_1007', 'worker-1');
    guard.fail('payments', 'pay_tx_1007', 'worker-1', 'Timeout no gateway de cartão');

    const retry = guard.acquire('payments', 'pay_tx_1007', 'worker-retry');
    assert.equal(retry.action, 'proceed');
    assert.equal(retry.record?.state, 'processing');
    assert.equal(retry.record?.ownerId, 'worker-retry');
    assert.equal(retry.record?.attempts, 2);
  });
});
