# Packages

Every folder in `app/packages/` is a **deep module**: a lot of behaviour behind a small interface. Copy `example/` to start a new one.

```
app/packages/
  <name>/
    index.ts        ← entry point (public). Import this from outside.
    client.ts       ← another entry point. A package may expose several.
    lib/            ← implementation: private, free to import each other.
    tests/          ← co-located tests + fixtures: private.
```

A package's **entry points** are its root files. Anything in a subfolder is private. Import a package only through its entry points, e.g. `~/packages/example` or `~/packages/example/client`, never `~/packages/example/lib/...`.

**Avoid barrel files.** Don't re-export a whole subtree through one giant `index.ts`. Expose several small entry points (`index.ts`, `client.ts`, `server.ts`) and keep implementation hidden in `lib/`. Packages are flat: a package may not contain another package.

## The rules

Enforced by dependency-cruiser (`.dependency-cruiser.cjs`). Run `npm run lint:boundaries`.

**Entry-point boundary.** Code outside a package (app code or another package) may import only that package's root files, never anything in its subfolders.

**Intra-package freedom.** A package's own files import each other freely.

**Tests through the entry points.** Files under `<pkg>/tests/` may import any package's entry points and their own `tests/` fixtures, but never any package's subfolder internals, not even their own. Nothing outside `tests/` may import from `tests/`.

**No cycles.** No dependency cycles.
