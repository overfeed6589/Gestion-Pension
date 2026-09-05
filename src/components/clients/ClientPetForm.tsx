'use client';

import { useActionState, useState } from 'react';
import { createClientWithPetAction } from '@/app/dashboard/clients/actions';
import { VaccineInput } from '@/lib/validations/client-pet';

export function ClientPetForm() {
  const [state, formAction, isPending] = useActionState(createClientWithPetAction, { success: false });
  const [vaccines, setVaccines] = useState<VaccineInput[]>([
    { name: 'CHPL', expiresAt: '', isMandatory: true },
    { name: 'Rage', expiresAt: '', isMandatory: true },
  ]);

  const addVaccine = () => {
    setVaccines([...vaccines, { name: '', expiresAt: '', isMandatory: false }]);
  };

  const updateVaccine = (
    index: number,
    field: keyof VaccineInput,
    value: string | boolean
  ) => {
    setVaccines((prev) =>
      prev.map((v, i) => (i === index ? ({ ...v, [field]: value } as VaccineInput) : v))
    );
  };

  return (
    <form action={formAction} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200">
      <input type="hidden" name="pet.vaccines" value={JSON.stringify(vaccines)} />

      <h2 className="text-lg font-bold border-b pb-2">1. Informations du Propriétaire</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <input name="firstName" placeholder="Prénom" className="w-full border p-2 rounded text-sm" required />
          {state.errors?.firstName && <p className="text-red-500 text-xs">{state.errors.firstName[0]}</p>}
        </div>
        <div>
          <input name="lastName" placeholder="Nom" className="w-full border p-2 rounded text-sm" required />
          {state.errors?.lastName && <p className="text-red-500 text-xs">{state.errors.lastName[0]}</p>}
        </div>
        <div>
          <input name="email" type="email" placeholder="Email" className="w-full border p-2 rounded text-sm" required />
          {state.errors?.email && <p className="text-red-500 text-xs">{state.errors.email[0]}</p>}
        </div>
        <div>
          <input name="phone" placeholder="Téléphone" className="w-full border p-2 rounded text-sm" required />
          {state.errors?.phone && <p className="text-red-500 text-xs">{state.errors.phone[0]}</p>}
        </div>
      </div>

      <h2 className="text-lg font-bold border-b pb-2">2. Animal & Registre I-CAD</h2>
      <div className="grid grid-cols-2 gap-4">
        <input name="pet.name" placeholder="Nom de l'animal" className="border p-2 rounded text-sm" required />
        <select name="pet.species" className="border p-2 rounded text-sm" required>
          <option value="Chien">Chien</option>
          <option value="Chat">Chat</option>
          <option value="NAC">NAC</option>
        </select>
        <input name="pet.breed" placeholder="Race" className="border p-2 rounded text-sm" />
        <select name="pet.sex" className="border p-2 rounded text-sm">
          <option value="M">Mâle</option>
          <option value="F">Femelle</option>
        </select>
        <div>
          <input name="pet.identificationNumber" placeholder="N° Puce / Tatouage I-CAD *" className="w-full border p-2 rounded text-sm font-mono" required />
          {state.errors?.['pet.identificationNumber'] && <p className="text-red-500 text-xs">{state.errors['pet.identificationNumber'][0]}</p>}
        </div>
        <input name="pet.passportNumber" placeholder="N° Passeport Européen" className="border p-2 rounded text-sm" />
      </div>

      <h2 className="text-lg font-bold border-b pb-2">3. Carnet de Vaccination</h2>
      <div className="space-y-2">
        {vaccines.map((v, idx) => (
          <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded">
            <input
              type="text"
              placeholder="Nom vaccin (ex: Toux de Chenil)"
              value={v.name}
              onChange={(e) => updateVaccine(idx, 'name', e.target.value)}
              className="border p-1 text-sm rounded flex-1"
            />
            <input
              type="date"
              value={v.expiresAt || ''}
              onChange={(e) => updateVaccine(idx, 'expiresAt', e.target.value)}
              className="border p-1 text-sm rounded"
            />
          </div>
        ))}
        <button type="button" onClick={addVaccine} className="text-xs text-blue-600 font-medium">+ Ajouter un vaccin</button>
      </div>

      {state.message && <p className={`text-sm ${state.success ? 'text-green-600' : 'text-red-600'}`}>{state.message}</p>}

      <button type="submit" disabled={isPending} className="w-full bg-emerald-600 text-white p-2 rounded font-medium disabled:opacity-50">
        {isPending ? 'Enregistrement...' : 'Enregistrer le Client & l\'Animal'}
      </button>
    </form>
  );
}