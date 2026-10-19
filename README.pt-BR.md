# Idempotent Worker Guard

Bloqueio idempotente determinístico e mitigação de execuções duplicadas para filas assíncronas, processadores de tarefas em segundo plano e gateways de pagamento.

[![CI](https://github.com/FelipeMadson/opp-06/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeMadson/opp-06/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*Read this in [English](README.md).*

---

## Visão Geral

Em arquiteturas distribuídas e filas assíncronas (como BullMQ, Celery, SQS ou Kafka), mensagens duplicadas ocorrem com frequência em razão de retentativas de rede, reentregas de broker ou timeouts de nós de processamento. Executar transações financeiras ou disparos de webhooks sem garantias formais de idempotência acarreta cobranças em dobro e corrupção de estado.

O `Idempotent Worker Guard` provê uma primitiva leve e resiliente com:
- **Aquisição Atômica de Lease**: Impede processamento simultâneo entre instâncias concorrentes.
- **Recuperação Automática de Falhas**: Recupera e reatribui leases expirados caso um worker sofra crash antes da conclusão.
- **Replay Determinístico**: Armazena o resultado final e responde requisições idênticas subsequentes instantaneamente sem reexecutar efeitos colaterais.
- **Verificação Rígida de Posse de Lease**: Apenas o worker atualmente detentor do lease pode registrar o estado como `completed` ou `failed`.

---

## Instalação e Testes

```bash
# Clonar o repositório
git clone https://github.com/FelipeMadson/opp-06.git
cd opp-06

# Executar suíte de testes unitários
npm test
```

---

## Exemplo de Uso

```typescript
import { IdempotencyGuard } from './src/index.ts';

const guard = new IdempotencyGuard();
const scope = 'cobrancas';
const key = 'pedido_9941';
const workerId = 'worker-node-01';

const lock = guard.acquire(scope, key, workerId, 20000);

if (lock.action === 'replay') {
  console.log('Requisição duplicada já processada. Resultado em cache:', lock.record?.result);
} else if (lock.action === 'busy') {
  console.warn('Outro worker está processando este pedido neste momento.');
} else {
  try {
    // Processamento do pagamento
    const resultado = { idTransacao: 'tx_5544', status: 'pago' };
    guard.complete(scope, key, workerId, resultado);
  } catch (err) {
    guard.fail(scope, key, workerId, (err as Error).message);
  }
}
```

---

## Licença

MIT © [Felipe Madison](https://github.com/FelipeMadson)
