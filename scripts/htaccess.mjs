// Only for `npm run build:clean` (clean URLs at the domain root): writes the SPA rewrite rules into dist/.htaccess.
import { writeFileSync } from 'node:fs';

writeFileSync(new URL('../dist/.htaccess', import.meta.url), `# Single-page app: send every non-file URL to index.html (Apache / LiteSpeed). Site must live at the domain root.
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
`);
console.log('dist/.htaccess written');
