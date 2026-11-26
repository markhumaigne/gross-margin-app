import assert from 'node:assert/strict';
import { test } from './harness';
import { parseMoney, percentOf } from '../../shared/domain/money';
import { isIsoDate, todayInManila } from '../../shared/domain/dates';
import {
  hasPermission,
  homePath,
  pathPermission,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from '../../shared/domain/roles';

test('parseMoney accepts plain, comma, peso-sign, PHP and parenthesised amounts', () => {
  assert.equal(parseMoney('1,299.50'), 1299.5);
  assert.equal(parseMoney('₱1,299.50'), 1299.5);
  assert.equal(parseMoney('PHP 899'), 899);
  assert.equal(parseMoney(5795), 5795);
  assert.equal(parseMoney('(150.00)'), -150);
  assert.equal(parseMoney(0.1 + 0.2), 0.3);
});

test('parseMoney rejects blanks, text and fractions of a centavo', () => {
  for (const v of ['', '   ', null, undefined, 'abc', '12.345', '99.999', '1,2x', NaN, Infinity])
    assert.equal(parseMoney(v), null, String(v));
});

test('percentOf rounds half away from zero to two decimals', () => {
  assert.equal(percentOf(1, 3), 33.33);
  assert.equal(percentOf(2, 3), 66.67);
  assert.equal(percentOf(1, 20000), 0.01);
  assert.equal(percentOf(-1, 20000), -0.01);
  assert.equal(percentOf(80000, 579500), 13.81);
  assert.equal(percentOf(1, 0), null);
});

test('todayInManila uses the Manila calendar date', () => {
  assert.equal(todayInManila(new Date('2026-11-16T16:30:00Z')), '2026-11-17');
  assert.equal(todayInManila(new Date('2026-11-17T15:59:00Z')), '2026-11-17');
});

test('isIsoDate accepts only real YYYY-MM-DD dates', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  for (const v of ['2026-02-30', '11/17/2026', '', '2026-1-01']) assert.equal(isIsoDate(v), false);
});

test('role permissions match the access matrix', () => {
  assert.deepEqual([...ROLE_PERMISSIONS.admin].sort(), ['calculator', 'price-books', 'users']);
  assert.deepEqual([...ROLE_PERMISSIONS['accounting-head']], ['calculator']);
  assert.deepEqual([...ROLE_PERMISSIONS['product-team']], ['price-books']);
  assert.equal(hasPermission(null, 'calculator'), false);
  assert.deepEqual(ROLE_LABELS, {
    admin: 'Admin',
    'accounting-head': 'Accounting Head',
    'product-team': 'Product Team',
  });
  assert.equal(homePath('accounting-head'), '/calculator');
});

test('pathPermission maps URLs to the permission that guards them', () => {
  assert.equal(pathPermission('/sales-report?x=1'), 'calculator');
  assert.equal(pathPermission('/price-books/PL000013/edit'), 'price-books');
  assert.equal(pathPermission('/calculator#results'), 'calculator');
  assert.equal(pathPermission('/'), null);
  assert.equal(pathPermission('/forbidden'), null);
});
