// Gizli ortam dosyalarının depoya ve yayına girmemesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lines = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split(/\r?\n/).map(line => line.trim());

test('.env dosyaları git ve Vercel dağıtımı dışında tutulur', () => {
    assert.ok(lines('.gitignore').includes('.env*'), '.gitignore');
    assert.ok(lines('.vercelignore').includes('.env*'), '.vercelignore');
});
