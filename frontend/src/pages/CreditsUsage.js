import React, { useMemo, useState } from 'react';
import { Coins } from 'lucide-react';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { useAuth } from '../contexts/AuthContext';
import { makeOcrApi } from '../modules/ocr2/api';
import { CreditsTab } from '../modules/ocr2/CreditsTab';

export default function CreditsUsage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();
  const api = useMemo(() => makeOcrApi(headers), [JSON.stringify(headers)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [usage, setUsage] = useState(null);
  return (
    <main className="mx-auto w-full max-w-[1700px] space-y-6 pb-12" data-testid="credits-usage-page">
      <ModulePageHeader title="Credits Usage" icon={Coins} iconClassName="border-amber-200 bg-amber-50 text-amber-700" testId="credits-usage" />
      <CreditsTab api={api} usage={usage} setUsage={setUsage} />
    </main>
  );
}
