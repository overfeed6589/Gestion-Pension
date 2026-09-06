'use client';

import { useActionState } from 'react';
import { savePensionSettingsAction } from '@/app/dashboard/parametres/actions';
import { ActionState } from '@/types/actions';

const initialState: ActionState = { success: false };

export type ParametresDefaults = {
  pensionName: string;
  legalAddress: string;
  siret: string;
  contactEmail: string;
  phone: string;
  depositPercent: number;
  cancellationRefundDays: number;
  offerValidityHours: number;
  publicDomain: string;
  logoUrl: string;
  arrivalSlots: string[];
  departureSlots: string[];
  reminderDays: number[];
};

export function ParametresForm({ defaults }: { defaults: ParametresDefaults }) {
  const [state, formAction, isPending] = useActionState(savePensionSettingsAction, initialState);
  const input = 'border rounded-lg p-2 w-full text-sm';

  return (
    <form action={formAction} className="bg-white border rounded-xl p-6 space-y-4 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Nom de la pension</label>
          <input name="pensionName" defaultValue={defaults.pensionName} className={input} required />
        </div>
        <div>
          <label className="text-sm font-medium">Téléphone</label>
          <input name="phone" defaultValue={defaults.phone} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Adresse légale (mentions site public)</label>
          <input name="legalAddress" defaultValue={defaults.legalAddress} className={input} />
        </div>
        <div>
          <label className="text-sm font-medium">SIRET</label>
          <input name="siret" defaultValue={defaults.siret} maxLength={14} className={input} />
        </div>
        <div>
          <label className="text-sm font-medium">Email de contact (secrétaire)</label>
          <input name="contactEmail" type="email" defaultValue={defaults.contactEmail} className={input} />
        </div>
        <div>
          <label className="text-sm font-medium">Acompte (%)</label>
          <input
            name="depositPercent"
            type="number"
            min={0}
            max={100}
            defaultValue={defaults.depositPercent}
            className={input}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Remboursement acompte si annulation ≥ (jours)</label>
          <input
            name="cancellationRefundDays"
            type="number"
            min={0}
            defaultValue={defaults.cancellationRefundDays}
            className={input}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Validité d’une offre (heures)</label>
          <input
            name="offerValidityHours"
            type="number"
            min={1}
            defaultValue={defaults.offerValidityHours}
            className={input}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Domaine public (ex: reserve.chat-s-amuse.com)</label>
          <input name="publicDomain" defaultValue={defaults.publicDomain} className={input} />
        </div>
        <div>
          <label className="text-sm font-medium">URL du logo</label>
          <input name="logoUrl" defaultValue={defaults.logoUrl} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            Créneaux d’arrivée (séparés par des virgules)
          </label>
          <input name="arrivalSlots" defaultValue={defaults.arrivalSlots.join(', ')} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            Créneaux de départ (séparés par des virgules)
          </label>
          <input name="departureSlots" defaultValue={defaults.departureSlots.join(', ')} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">
            Jours de relance des heures avant l’arrivée (ex: 15, 7, 1)
          </label>
          <input name="reminderDays" defaultValue={defaults.reminderDays.join(', ')} className={input} />
        </div>
      </div>

      {state.message && (
        <p
          className={`text-sm rounded-lg p-3 ${
            state.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {isPending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
