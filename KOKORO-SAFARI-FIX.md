# Safari Kokoro fix — November 2026

The previous project imported a CDN-rebundled copy of `kokoro-js`. Both CDN paths failed in Safari with a `caches in self` type error. This release uses the original npm package and bundles its browser entry point at Docker build time using esbuild. The browser imports `/vendor/kokoro-engine.js` from the same origin as the game.

## Deploy

1. Back up the existing GitHub repository.
2. Upload all files in this ZIP, preserving the `src/` and `scripts/` directories.
3. Render's Docker build now runs `npm install --omit=dev` and `npm run build`. No local npm install is necessary.
4. After Render finishes, close the old game tabs, open a fresh Safari window, and press **TEST SOUND**.
5. Visit MC Library and compare two different preset MC previews. Confirm that the status says the Kokoro voice name and not browser fallback.

**Unverified:** The package could not be installed or browser-tested in this environment (npm registry unavailable). Bundling can also encounter WebAssembly asset/runtime constraints, so do not assume Kokoro works until you test on Safari. If Render build fails, retain the previous deployment and share the build log. If the test sound fails, share the exact new error.

**Preserved:** socket game, 15 mystery beat styles, adaptive looping, voting, custom `/api/voice` endpoint, and browser fallback.
