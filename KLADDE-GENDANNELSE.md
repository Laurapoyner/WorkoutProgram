# Robust kladde-gendannelse

Denne version beskytter igangværende træningspas bedre på tværs af deployments.

## Hvad er ændret

- Gamle `active_workout`-dokumenter migreres automatisk til den nye `workout_draft`-struktur.
- Hvis både en gammel kladde og en ny tom kladde findes for samme program, vælges den med mest faktisk træningsprogression.
- En 0/x-kladdesession kan ikke længere overskrive en eksisterende kladde med gennemførte øvelser ved almindelig autosave.
- Et program matches både på plan-id og en stabil nøgle afledt af programnavnet, så en kladde kan findes igen selv efter ændring af interne id'er.
- Tidligere plan-id'er gemmes som aliases.
- En helt ny/urørt træning autosaves ikke længere blot fordi programmet har standardvægte.
- "Start forfra" virker fortsat som en eksplicit nulstilling, fordi den gamle kladde slettes først.

## Eksisterende 9/12-kladden

Den eksisterende MongoDB-post med `type: active_workout` bliver migreret automatisk første gang `/api/drafts` eller programkladde-endpointet kaldes efter deployment. Hvis den stadig findes i databasen, skal de 9 gennemførte øvelser derfor komme tilbage automatisk.
