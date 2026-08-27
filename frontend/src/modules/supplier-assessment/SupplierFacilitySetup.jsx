import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useAuth } from '../../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DRAFT_KEY = 'supplier-facility-setup-draft';
const emptyForm = { name: '', address: '', city: '', country: '', pincode: '', products_services: '', responsible_person: '', responsible_person_contact: '' };

export default function SupplierFacilitySetup() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  useEffect(() => { const draft = localStorage.getItem(DRAFT_KEY); if (draft) setForm({ ...emptyForm, ...JSON.parse(draft) }); }, []);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const saveProgress = () => { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); toast.success('Setup progress saved on this device'); };
  const submit = async () => { if (!form.name.trim()) { toast.error('Facility name is required'); return; } setSaving(true); try { await axios.post(`${API}/supplier-assessment/my-assessment/facility`, form, { headers: getAuthHeader() }); localStorage.removeItem(DRAFT_KEY); toast.success('Facility information is complete'); navigate('/supplier-assessment/supplier'); } catch (error) { toast.error(error.response?.data?.detail || 'Could not save facility information'); } finally { setSaving(false); } };
  return <main className="mx-auto max-w-3xl py-6" data-testid="supplier-facility-setup"><Button variant="ghost" size="sm" onClick={() => navigate('/supplier-assessment/supplier')} data-testid="back-to-supplier-onboarding-button"><ArrowLeft className="mr-1 h-4 w-4" />Back</Button><Card className="mt-4 border-stone-200 shadow-none"><CardHeader><div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Building2 className="h-5 w-5" /></div><CardTitle className="mt-3">Facility Information</CardTitle><p className="text-sm text-stone-600">Start with the essentials. You can add more operational information later.</p></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="facility-name">Facility name *</Label><Input id="facility-name" value={form.name} onChange={(event) => update('name', event.target.value)} data-testid="supplier-facility-name-input" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="facility-address">Address</Label><Input id="facility-address" value={form.address} onChange={(event) => update('address', event.target.value)} data-testid="supplier-facility-address-input" /></div><div className="space-y-2"><Label htmlFor="facility-city">City</Label><Input id="facility-city" value={form.city} onChange={(event) => update('city', event.target.value)} data-testid="supplier-facility-city-input" /></div><div className="space-y-2"><Label htmlFor="facility-country">Country</Label><Input id="facility-country" value={form.country} onChange={(event) => update('country', event.target.value)} data-testid="supplier-facility-country-input" /></div><div className="space-y-2"><Label htmlFor="facility-pincode">Pincode</Label><Input id="facility-pincode" value={form.pincode} onChange={(event) => update('pincode', event.target.value)} data-testid="supplier-facility-pincode-input" /></div><div className="space-y-2"><Label htmlFor="facility-contact">Responsible person</Label><Input id="facility-contact" value={form.responsible_person} onChange={(event) => update('responsible_person', event.target.value)} data-testid="supplier-facility-contact-input" /></div></div><div className="flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-5"><Button variant="outline" onClick={saveProgress} data-testid="save-facility-progress-button">Save progress</Button><Button onClick={submit} disabled={saving} data-testid="complete-facility-setup-button">{saving ? 'Saving…' : 'Complete Facility Information'}<ArrowRight className="ml-2 h-4 w-4" /></Button></div></CardContent></Card></main>;
}