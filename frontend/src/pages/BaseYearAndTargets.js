/**
 * BaseYearAndTargets — wrapper page for the renamed
 * "Base Year Emissions and Target Setting" workspace.
 *
 * Two tabs:
 *  - Base Year Emissions  → existing BaseYearEmissions component (unchanged)
 *  - Target Setting       → TargetSettingsPage (new, in /modules/targets)
 *
 * Top-level header is owned here so the tabs feel like sub-views of one
 * coherent workspace.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { CalendarClock, Target as TargetIcon } from 'lucide-react';
import BaseYearEmissions from './BaseYearEmissions';
import TargetSettingsPage from '../modules/targets/pages/TargetSettingsPage';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BaseYearAndTargets() {
  const { user, getAuthHeader } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [activeTab, setActiveTab] = useState('base-year');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/organizations/my`, { headers: getAuthHeader() });
        if (!cancelled) setOrganization(data);
      } catch {
        /* ignore — Target tab will fall back to defaults */
      }
    })();
    return () => { cancelled = true; };
  }, [getAuthHeader]);

  return (
    <div className="space-y-6" data-testid="base-year-and-targets-page">
      <div>
        <h1 className="text-2xl font-heading font-bold text-text-primary">
          Base Year Emissions and Target Setting
        </h1>
        <p className="text-text-muted mt-1">
          Configure your reference baseline and reduction targets for tracking GHG progress.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="base-year" data-testid="tab-base-year">
            <CalendarClock className="w-4 h-4 mr-1.5" />
            Base Year Emissions
          </TabsTrigger>
          <TabsTrigger value="targets" data-testid="tab-targets">
            <TargetIcon className="w-4 h-4 mr-1.5" />
            Target Setting
          </TabsTrigger>
        </TabsList>

        <TabsContent value="base-year" className="mt-4">
          <BaseYearEmissions hideTopHeader />
        </TabsContent>

        <TabsContent value="targets" className="mt-4">
          <TargetSettingsPage organization={organization} currentUser={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
