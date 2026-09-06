'use client';

import { useState } from 'react';
import {
  updateHousingUnitAction,
  deleteHousingUnitAction,
} from '@/app/dashboard/housing/actions';

export function UnitManage({ unitId, name }: { unitId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    const res = await updateHousingUnitAction(unitId, value);
    setBusy(false);
    setEditing(false);
    setMsg(res.message ?? null);
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer le box « ${name} » ?`)) return;
    setBusy(true);
    const res = await deleteHousingUnitAction(unitId);
    setBusy(false);
    setMsg(res.message ?? null);
  };

  return (
    <div className="space-y-1">
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border rounded px-1.5 py-0.5 text-xs w-24"
          />
          <button onClick={save} disabled={busy} className="bg-slate-900 text-white text-[11px] rounded px-2 py-0.5 disabled:opacity-50">
            OK
          </button>
          <button onClick={() => setEditing(false)} className="text-[11px] underline text-slate-500">
            Annuler
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11px]">
          <button onClick={() => { setValue(name); setEditing(true); }} className="underline text-slate-500 hover:text-slate-800">
            Renommer
          </button>
          <button onClick={remove} disabled={busy} className="underline text-red-600">
            Supprimer
          </button>
        </div>
      )}
      {msg && <p className="text-[11px] text-slate-600">{msg}</p>}
    </div>
  );
}
