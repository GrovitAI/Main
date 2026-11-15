/**
 * Task 309: icons one by one. `import { House } from 'lucide-react-native'` brought every icon the
 * package has (about 1,750, 1.2 MB) into the app, because the bundler keeps a whole package that
 * is imported by name. This rewrites each icon to its own file, so only the icons in use ship:
 *   import { House, type LucideIcon } from 'lucide-react-native'
 *   -> import House from 'lucide-react-native/icons/house'; import { type LucideIcon } from 'lucide-react-native'
 * Jest keeps the plain import, which the tests mock.
 */
const fs = require('fs');
const path = require('path');

let iconFiles = null;

/** Every exported icon name (aliases too) and the file it lives in, read from the package's index. */
function readIconFiles() {
  if (iconFiles) return iconFiles;
  const index = path.join(path.dirname(require.resolve('lucide-react-native')), '..', 'esm', 'lucide-react-native.mjs');
  iconFiles = new Map();
  for (const match of fs.readFileSync(index, 'utf8').matchAll(/export \{([^}]+)\} from '\.\/icons\/([a-z0-9-]+)\.mjs';/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().replace(/^default as /, '');
      if (name) iconFiles.set(name, match[2]);
    }
  }
  if (iconFiles.size < 1000) throw new Error('lucide-icon-imports: could not read the icon list from ' + index);
  return iconFiles;
}

module.exports = function lucideIconImports({ types: t }) {
  return {
    name: 'lucide-icon-imports',
    visitor: {
      ImportDeclaration(declaration) {
        const node = declaration.node;
        if (node.source.value !== 'lucide-react-native' || node.importKind === 'type' || process.env.NODE_ENV === 'test') return;
        const files = readIconFiles();
        const kept = [];
        const icons = [];
        for (const specifier of node.specifiers) {
          const imported = t.isImportSpecifier(specifier) && specifier.importKind !== 'type'
            ? (t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value) : null;
          const file = imported ? files.get(imported) : undefined;
          if (file) icons.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(specifier.local.name))], t.stringLiteral('lucide-react-native/icons/' + file)));
          else kept.push(specifier);
        }
        if (icons.length === 0) return;
        if (kept.length > 0) {
          node.specifiers = kept;
          declaration.insertAfter(icons);
        } else {
          declaration.replaceWithMultiple(icons);
        }
      },
    },
  };
};
