import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { ErrorNote, Field, FormSection, Modal } from "../../ui";

export default function NewEntry({ year, price, onClose, onDone }) {
  const [f, setF] = useState({ kind: "purchase", quantity: "", price: price ? price.toFixed(2) : "", date: "2027-02-15", note: "" });
  const m = useMutation({ mutationFn: () => api.post("/certificates", { ...f, obligation_year: year }), onSuccess: onDone });
  return (
    <Modal title="Record Certificate Transaction" onClose={onClose} wide={false}>
      <FormSection title="Transaction" subtitle="Purchases on the common central platform, surrenders and repurchases with your NCA.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" required><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="purchase">Purchase</option><option value="surrender">Surrender</option><option value="repurchase">Repurchase</option></select></Field>
          <Field label="Date" required><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Quantity (certificates)" required><input type="number" className="input" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          <Field label="Price (€ / certificate)"><input type="number" step="any" className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
        </div>
      </FormSection>
      <ErrorNote error={m.error} />
      <div className="flex justify-end gap-3"><button className="btn-outline rounded-full" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.quantity} onClick={() => m.mutate()}>Save</button></div>
    </Modal>
  );
}
