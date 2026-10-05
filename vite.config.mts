import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import pkg from './package.json';

// Same library build as @llmnative/react: ES + CJS, every dependency and peer stays external.
const externalPackages = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
]);

const external = (id: string) => {
    if (id.startsWith('node:') || builtinModules.includes(id)) return true;
    return [...externalPackages].some((name) => id === name || id.startsWith(`${name}/`))
        || id === 'react/jsx-runtime';
};

export default defineConfig({
    build: {
        target: 'baseline-widely-available',
        lib: {
            entry: { index: resolve(__dirname, 'src/index.ts') },
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => (format === 'es' ? `${entryName}.mjs` : `${entryName}.js`),
        },
        rolldownOptions: { external },
        sourcemap: true,
        emptyOutDir: true,
    },
});
