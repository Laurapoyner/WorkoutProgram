# Forrige belastning i nyt træningspas

Når et helt nyt træningspas åbnes, udfyldes belastningen automatisk med den senest registrerede belastning for samme øvelse i samme træningsprogram.

- Almindelige øvelser: `weightKg` hentes fra seneste registrering.
- Øvelser opdelt pr. ben: `leftLegWeightKg` og `rightLegWeightKg` hentes hver for sig.
- En eksisterende kladde overskrives ikke; kladdens egne værdier har altid prioritet.
- Programmens gemte standardvægt ændres ikke. Den tidligere belastning bruges kun som startværdi i det nye pas.
- Tids-/scoreøvelser påvirkes ikke.
