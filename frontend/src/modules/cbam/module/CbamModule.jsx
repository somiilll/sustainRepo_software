import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { ReadOnlyContext } from "../ui";
import Overview from "./pages/Overview";
import Imports from "./pages/Imports";
import Installations from "./pages/Installations";
import InstallationDetail from "./pages/InstallationDetail";
import Suppliers from "./pages/Suppliers";
import Declarations from "./pages/Declarations";
import Reference from "./pages/Reference";
import EmissionsSplit from "./pages/EmissionsSplit";
import Geography from "./pages/Geography";
import Simulator from "./pages/Simulator";
import Settings from "./pages/Settings";
import CertificatesDashboard from "./pages/CertificatesDashboard";

export const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

export function CbamPublicPage({ children }) {
  return (
    <QueryClientProvider client={qc}>
      <div className="cbam-root">{children}</div>
    </QueryClientProvider>
  );
}

export default function CbamModule() {
  const { user } = useAuth();
  const readOnly = !["admin", "super_admin"].includes(user?.role);
  return (
    <QueryClientProvider client={qc}>
      <ReadOnlyContext.Provider value={readOnly}>
      <div className="cbam-root" data-testid="cbam-module">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="emissions" element={<EmissionsSplit />} />
          <Route path="geography" element={<Geography />} />
          <Route path="holdings" element={<CertificatesDashboard />} />
          <Route path="simulator" element={<Simulator />} />
          <Route path="settings" element={<Settings />} />
          <Route path="imports" element={<Imports />} />
          <Route path="installations" element={<Installations />} />
          <Route path="installations/:id" element={<InstallationDetail />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="declarations" element={<Declarations />} />
          <Route path="reference" element={<Reference />} />
        </Routes>
      </div>
      </ReadOnlyContext.Provider>
    </QueryClientProvider>
  );
}
