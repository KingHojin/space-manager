# Phase 7 Local Check

After merge:

```bash
git checkout master
git pull origin master
npm run build
npm run dev
```

Focus checks:

- Existing save migrates crew injury string into object without crashing.
- Crew panel opens and shows injury stage chips.
- Crisis-generated injuries appear as 경상/중상 with recovery progress.
- Serious+ crew are removed from room/crisis work.
- Medic performs medical-care when serious+ injured crew exists.
