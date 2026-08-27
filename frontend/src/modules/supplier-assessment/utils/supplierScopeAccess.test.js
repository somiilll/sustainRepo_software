import { describe, expect, test } from '@jest/globals';
import { filterSupplierVisibleScopes } from './supplierScopeAccess';

const allScopes = [
  { code: 'scope1', label: 'Scope 1' },
  { code: 'scope2', label: 'Scope 2' },
  { code: 'scope3', label: 'Scope 3' },
  { code: 'biogenic', label: 'Biogenic' },
];

describe('supplier scope visibility', () => {
  test('shows only Scope 1 when only Scope 1 is assigned', () => {
    expect(filterSupplierVisibleScopes(allScopes, ['scope1']).map((scope) => scope.code)).toEqual(['scope1']);
  });

  test('shows only Scope 2 when only Scope 2 is assigned', () => {
    expect(filterSupplierVisibleScopes(allScopes, ['scope2']).map((scope) => scope.code)).toEqual(['scope2']);
  });

  test('shows Scope 1 and Scope 2 when both are assigned', () => {
    expect(filterSupplierVisibleScopes(allScopes, ['scope1', 'scope2']).map((scope) => scope.code)).toEqual(['scope1', 'scope2']);
  });

  test('never exposes Scope 3 or Biogenic even if incorrectly configured', () => {
    expect(filterSupplierVisibleScopes(allScopes, ['scope1', 'scope2', 'scope3', 'biogenic']).map((scope) => scope.code)).toEqual(['scope1', 'scope2']);
  });
});