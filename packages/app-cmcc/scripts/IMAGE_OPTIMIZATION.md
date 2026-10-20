# Image Optimization

The checked-in WebP derivatives are generated offline. Deployment only serves
static files; it does not need Sharp, native codecs, or a new runtime service.
Every original image is retained at its original path.

- Quality: 92, lossy WebP; alpha quality: 100.
- Raster images keep their original pixel dimensions.
- The three large Wiki SVG compositions are rendered by Chrome at 2x their declared
  size, preserving their aspect ratios and their existing CSS display sizes.
- Animated derivatives keep their frame count, frame delays, and loop count.
- An encode is used only when it is smaller than the original. Existing small
  lossy WebP files, QR codes, favicons, and ordinary vector SVGs are not re-encoded.
- Uploaded case covers are not included; these live in backend storage.

`image-optimization.json` records paths, SHA-256 hashes, byte sizes, quality,
dimensions, and animation metadata. It also records the source-reference edits.
The landing page keeps its original compiled bundle and uses a new content-hashed
bundle, so cached clients do not receive changed bytes at an immutable old URL.

## Regenerate

Run `node scripts/optimize-images.mjs` from this package with Sharp installed in
the developer environment. `IMAGE_SHARP_MODULE` can point to an existing Sharp
package directory. TypeScript is resolved from this package's dependencies.
The Wiki compositions also use the existing Playwright dependency and its Chrome
browser. `IMAGE_CHROME_EXECUTABLE` can select an installed Chrome executable.
Unchanged derivatives are reused after verifying both source and output hashes.
This is a maintenance command, not part of the deployment build.

After replacing original artwork or re-syncing the landing page, rerun the
command, review the generated images, and run:

```text
bun test ./scripts/image-optimization.test.ts
bun typecheck
bun run build
```

To restore an individual original, change its import/URL back to the `source`
path recorded in the manifest. No original needs to be recovered from Git.
