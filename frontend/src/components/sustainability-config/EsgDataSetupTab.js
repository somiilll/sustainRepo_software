import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ModulesTab } from './ModulesTab';
import { KPIOverridesTab } from './KPIOverridesTab';
import { CustomCategoriesTab } from './CustomCategoriesTab';
import { FeaturesTab } from './FeaturesTab';
import { AIQueryAliasesTab } from './AIQueryAliasesTab';

export function EsgDataSetupTab({ orgConfig, allDefaultModules, onSave, saving }) {
  return (
    <section data-testid="esg-data-setup-tab">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-stone-900" data-testid="esg-data-setup-title">ESG Data Setup</h2>
        <p className="mt-1 text-sm text-stone-500" data-testid="esg-data-setup-description">Configure the ESG workspace’s modules, categories, fields, features, and AI terminology.</p>
      </div>
      <Tabs defaultValue="modules">
        <TabsList className="flex-wrap" data-testid="esg-data-setup-navigation">
          <TabsTrigger value="modules" data-testid="esg-data-setup-modules-trigger">Modules Mode</TabsTrigger>
          <TabsTrigger value="categories" data-testid="esg-data-setup-categories-trigger">Custom Categories</TabsTrigger>
          <TabsTrigger value="kpis" data-testid="esg-data-setup-kpis-trigger">KPI Overrides</TabsTrigger>
          <TabsTrigger value="aliases" data-testid="esg-data-setup-aliases-trigger">AI Query Aliases</TabsTrigger>
          <TabsTrigger value="features" data-testid="esg-data-setup-features-trigger">Features</TabsTrigger>
        </TabsList>
        <TabsContent value="modules" className="mt-4"><ModulesTab orgConfig={orgConfig} defaultModules={allDefaultModules.environment} onSave={onSave} saving={saving} /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CustomCategoriesTab orgConfig={orgConfig} onSave={onSave} saving={saving} /></TabsContent>
        <TabsContent value="kpis" className="mt-4"><KPIOverridesTab orgConfig={orgConfig} allDefaultModules={allDefaultModules} onSave={onSave} saving={saving} /></TabsContent>
        <TabsContent value="aliases" className="mt-4"><AIQueryAliasesTab orgConfig={orgConfig} allDefaultModules={allDefaultModules} onSave={onSave} saving={saving} /></TabsContent>
        <TabsContent value="features" className="mt-4"><FeaturesTab orgConfig={orgConfig} onSave={onSave} saving={saving} /></TabsContent>
      </Tabs>
    </section>
  );
}