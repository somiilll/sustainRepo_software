import React from 'react';
import { Card, CardContent } from '../../../../components/ui/card';
import EmissionsByScopeCategoryList from '../../../dashboard/components/charts/EmissionsByScopeCategoryList';

export const SupplierScope1CategoryComparison = ({ data }) => <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-scope-category-card"><CardContent className="p-5"><EmissionsByScopeCategoryList data={data} showScope3={false} /></CardContent></Card>;