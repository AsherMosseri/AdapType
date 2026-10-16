# AdapType

A typing game that learns your weak spots and keeps targeting them. You start
with a few letters; AdapType times every keystroke, scores each key and letter
pair, builds each round around what needs work, and unlocks a new letter once
you've mastered the current ones.

Works with a physical keyboard or AdapType's own on-screen touch keyboard.
Progress stays in your browser. It can be installed to a home screen or
desktop and works offline.

See [PLAN.md](PLAN.md) for the full roadmap. Phases 1 to 7 are built.

## Run it

```sh
npm install
npm run dev       # local dev server
npm test          # engine tests, test vectors and web tests
npm run build     # production build into dist/
```

## Layout

| Folder | What's in it |
| --- | --- |
| `engine/` | The framework-free engine (TypeScript), its spec (`engine/spec.md`), tests, and shared test vectors (`engine/vectors/`) that future Swift and Kotlin ports must pass |
| `content/` | The English word pack and blocklist, with credits and the build script |
| `web/` | The web app: screens, on-screen keyboard, storage, styles, the service worker (`web/sw.js`, filled in by the build) and icons (`web/public/`) |
| `.github/workflows/` | Tests, builds and deploys to GitHub Pages on every push to `main` |

## Deploying

The workflow deploys to GitHub Pages from `main`. In the repository's
**Settings → Pages**, set **Source** to **GitHub Actions** once. The site is
served at `https://<user>.github.io/AdapType/`; set `ADAPTYPE_BASE` at build
time to serve it from a different path.

## Credits

Word frequencies from [wordfreq](https://github.com/rspeer/wordfreq) (CC BY-SA
4.0), filtered with [SCOWL](https://github.com/en-wl/wordlist). See
[content/README.md](content/README.md).
