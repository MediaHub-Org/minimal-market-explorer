import { defineConfig, type Plugin } from 'vite';

/**
 * Inline the built JS and CSS into dist/index.html so the app opens straight
 * from disk (file://), where browsers refuse to load external module scripts.
 */
function inlineAssets(): Plugin {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    name: 'inline-assets',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          page = page.replace(new RegExp(`<script[^>]*src="[^"]*${escape(name)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          page = page.replace(new RegExp(`<link[^>]*href="[^"]*${escape(name)}"[^>]*>`), () => `<style>${String(file.source)}</style>`);
          delete bundle[name];
        }
      }
      html.source = page;
    },
  };
}

export default defineConfig({
  base: './',
  build: { modulePreload: false },
  plugins: [inlineAssets()],
});
