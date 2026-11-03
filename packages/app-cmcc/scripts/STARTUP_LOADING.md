# Startup Loading Assets

Both `index.html` and `AppLoading` use `/brand/startup-loading.svg` and the same stylesheet. Text is rendered with system fonts, independently of the decorative background. The original raster assets remain available for rollback.

The wordmark uses a medium system font and individually distributed characters to approximate the original artwork's wider lettering without downloading a web font. The reference image does not identify its original font; this is a visual approximation, not a claim of an exact typeface match. Both loading stages share the same text widths and styling.

## Sources

- `public/brand/startup-loading.svg`: the supplied `jiazai.svg`, copied without changes (SHA-256 `7bd8ece5e10f3186a63e55933cfa20ac40d0b0928d02826a92682e4f1899bca5`).
- `src/assets/auth/startup-loading-background.webp`: background-only edit of `startup-loading.webp`, 1672 x 941, converted to WebP at quality 92. The foreground logo, text and dots are no longer part of this image.
- The new background was edited with the built-in image generation tool, not the CLI. Its subtle shading can differ slightly from the original. No generated logo or lettering is used.

## Background Edit Prompt

> Use case: precise-object-edit. Edit target: the supplied DeepInsight loading-screen background. Create a background-only version for this same application. Remove ONLY the central colored D logo, the DeepInsight wordmark, the three colored loading dots, and the Chinese '系统加载中...' text. Fill their old areas with the matching very pale white/light-blue background, completely clean with no ghosts or letter remnants. Keep the original subtle pale blue/lavender corner shading, the faint large circular decorative outline behind the logo, overall brightness, composition, proportions, and all background decoration unchanged as closely as possible. This is a restrained technical asset cleanup, not a redesign. No new objects, symbols, logos, text, watermark, blobs, or effects. Keep original 1672 by 941 landscape dimensions if possible; keep identical aspect ratio. The final output must contain background decoration only; all foreground UI will be rendered in code.
