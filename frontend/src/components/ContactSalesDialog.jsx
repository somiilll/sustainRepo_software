import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ContactSalesDialog = ({ getAuthHeader, onOpenChange, open, user }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '' });
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm((current) => ({ ...current, name: user?.full_name || '', email: user?.email || '', company: user?.organization_name || user?.company_name || '' }));
    axios.get(`${API}/organizations/my`, { headers: getAuthHeader() }).then(({ data }) => setForm((current) => ({ ...current, company: data.organization_name || data.name || current.company }))).catch(() => {});
  }, [getAuthHeader, open, user]);
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => { event.preventDefault(); setSubmitting(true); try { await axios.post(`${API}/contact-sales`, { name: form.name, email: form.email, phone: form.phone }, { headers: getAuthHeader() }); toast.success('Your request has been submitted.'); onOpenChange(false); } catch (error) { toast.error(error.response?.data?.detail || 'Could not submit your request.'); } finally { setSubmitting(false); } };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent data-testid="contact-sales-dialog"><DialogHeader><DialogTitle data-testid="contact-sales-title">Contact Sales</DialogTitle><DialogDescription data-testid="contact-sales-description">Our team will get back to you within 24 business hours.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit} data-testid="contact-sales-form"><div><Label htmlFor="contact-sales-name">Name</Label><Input id="contact-sales-name" value={form.name} onChange={update('name')} required data-testid="contact-sales-name-input" /></div><div><Label htmlFor="contact-sales-email">Email address</Label><Input id="contact-sales-email" type="email" value={form.email} onChange={update('email')} required data-testid="contact-sales-email-input" /></div><div><Label htmlFor="contact-sales-phone">Phone number</Label><Input id="contact-sales-phone" type="tel" value={form.phone} onChange={update('phone')} required data-testid="contact-sales-phone-input" /></div><div><Label htmlFor="contact-sales-company">Company</Label><Input id="contact-sales-company" value={form.company} readOnly data-testid="contact-sales-company-input" /></div><Button type="submit" className="w-full" disabled={submitting} data-testid="contact-sales-submit-button">{submitting ? 'Submitting…' : 'Submit request'}</Button></form></DialogContent></Dialog>;
};