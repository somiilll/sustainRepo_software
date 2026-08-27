import { describe, expect, test } from '@jest/globals';
import {
  isSupplierMutedMenuItem,
  isSupplierLockedRoute,
  SUPPLIER_PREMIUM_TOOLTIP,
} from './supplierNavigation';

describe('supplier navigation locks', () => {
  test.each([
    'dashboard',
    'environment.ghg.sinks',
    'environment.ghg.base_year',
    'environment.ghg.analysis',
  ])('uses muted supplier styling for %s', (key) => {
    expect(isSupplierMutedMenuItem(key)).toBe(true);
  });

  test.each([
    '/dashboard',
    '/ghg/base-year',
    '/ghg/analysis',
  ])('locks %s when opened directly', (path) => {
    expect(isSupplierLockedRoute(path)).toBe(true);
  });

  test.each([
    '/supplier-assessment/supplier',
    '/ghg',
    '/ghg/scope1',
    '/ghg/scope2',
  ])('keeps %s available to suppliers', (path) => {
    expect(isSupplierLockedRoute(path)).toBe(false);
  });

  test('uses the established premium module tooltip copy', () => {
    expect(SUPPLIER_PREMIUM_TOOLTIP).toEqual({
      title: 'Premium Module',
      description: 'Subscribe to unlock this module and access advanced ESG management features for your organization.',
    });
  });
});