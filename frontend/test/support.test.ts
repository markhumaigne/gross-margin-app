import assert from 'node:assert/strict';
import { test } from './harness';
import {
  marginAfterSupport,
  marginOnCost,
  saleSupportCents,
  supportFromDraft,
  supportToDraft,
  validateSupportDraft,
} from '../src/app/domain/support';

test('margin on cost matches ZenPOS', () => {
  assert.equal(marginOnCost(5190, 4750), 9.26);
  assert.equal(marginOnCost(11999, 12749.25), -5.88);
  assert.equal(marginOnCost(100, 0), null);
});

test('margin after support lowers cost by the pesos of support per unit', () => {
  assert.equal(marginAfterSupport(11999, 12749.25, 1500), 6.66);
  assert.equal(marginAfterSupport(11999, 12749.25, 1000), 2.13);
  assert.equal(marginAfterSupport(5190, 4750, undefined), 9.26);
});

test('support at or above cost leaves margin after support blank', () => {
  assert.equal(marginAfterSupport(1000, 900, 900), null);
  assert.equal(marginAfterSupport(1000, 900, 950), null);
});

test('support earned on a sale is pesos per unit times quantity', () => {
  assert.equal(saleSupportCents(1500, 2, 2399800), 300000);
  assert.equal(saleSupportCents(0.5, 3, 300), 150);
  assert.equal(saleSupportCents(1500, 1, 0), 0);
});

test('support drafts validate and convert as pesos', () => {
  assert.equal(validateSupportDraft(''), null);
  assert.equal(validateSupportDraft('₱1,500'), null);
  assert.equal(validateSupportDraft('-1'), 'Support must be zero or more with up to 2 decimals.');
  assert.equal(validateSupportDraft('5%'), 'Support must be zero or more with up to 2 decimals.');
  assert.equal(supportFromDraft(' '), undefined);
  assert.equal(supportFromDraft(undefined), undefined);
  assert.equal(supportFromDraft('1,500'), 1500);
  assert.equal(supportToDraft(undefined), '');
  assert.equal(supportToDraft(1500), '1500.00');
});
