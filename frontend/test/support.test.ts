import assert from 'node:assert/strict';
import { test } from './harness';
import {
  marginAfterSupport,
  marginOnCost,
  NO_SUPPORT_DRAFT,
  saleSupportCents,
  supportFromDraft,
  supportPerUnit,
  supportToDraft,
  validateSupportDraft,
} from '../src/app/domain/support';

test('margin on cost matches ZenPOS', () => {
  assert.equal(marginOnCost(5190, 4750), 9.26);
  assert.equal(marginOnCost(11999, 12749.25), -5.88);
  assert.equal(marginOnCost(100, 0), null);
});

test('margin after support lowers cost by the support per unit', () => {
  assert.equal(marginAfterSupport(11999, 12749.25, { kind: 'amount', value: 1500 }), 6.66);
  assert.equal(supportPerUnit(2795, { kind: 'percent', value: 5 }), 139.75);
  assert.equal(marginAfterSupport(2795, 1960, { kind: 'percent', value: 5 }), 53.55);
  assert.equal(supportPerUnit(99.99, { kind: 'percent', value: 12.5 }), 12.5);
  assert.equal(marginAfterSupport(5190, 4750, undefined), 9.26);
});

test('support at or above cost leaves margin after support blank', () => {
  assert.equal(marginAfterSupport(1000, 900, { kind: 'amount', value: 900 }), null);
  assert.equal(marginAfterSupport(1000, 900, { kind: 'amount', value: 950 }), null);
});

test('support earned on a sale', () => {
  assert.equal(saleSupportCents({ kind: 'amount', value: 1500 }, 2, 2399800), 300000);
  assert.equal(saleSupportCents({ kind: 'percent', value: 5 }, 2, 559000), 27950);
  assert.equal(saleSupportCents({ kind: 'amount', value: 1500 }, 1, 0), 0);
});

test('support drafts validate and convert', () => {
  assert.equal(validateSupportDraft({ kind: 'amount', value: '' }), null);
  assert.equal(validateSupportDraft({ kind: 'amount', value: '1,500' }), null);
  assert.equal(
    validateSupportDraft({ kind: 'amount', value: '-1' }),
    'Support must be zero or more with up to 2 decimals.',
  );
  assert.equal(
    validateSupportDraft({ kind: 'percent', value: '100.01' }),
    'Support % cannot exceed 100.',
  );
  assert.equal(supportFromDraft({ kind: 'amount', value: ' ' }), undefined);
  assert.deepEqual(supportFromDraft({ kind: 'percent', value: '5' }), {
    kind: 'percent',
    value: 5,
  });
  assert.deepEqual(supportToDraft(undefined), NO_SUPPORT_DRAFT);
  assert.deepEqual(supportToDraft({ kind: 'amount', value: 1500 }), {
    kind: 'amount',
    value: '1500.00',
  });
});
