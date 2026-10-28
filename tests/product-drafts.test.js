import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DRAFT_CATEGORIES, PRODUCT_DRAFTS } from '../product-drafts.js';
import { SLUG_RE } from '../api/_lib/shop.js';

const ROOT = resolve(import.meta.dirname, '..');

test('hazır taslakların bağlantı adları benzersiz ve kategorileri tanımlı', () => {
    const slugs = PRODUCT_DRAFTS.map(draft => draft.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    const categories = new Set(DRAFT_CATEGORIES.map(category => category.slug));
    for (const draft of PRODUCT_DRAFTS) {
        assert.match(draft.slug, SLUG_RE, draft.slug);
        assert.ok(categories.has(draft.category), `${draft.slug}: ${draft.category}`);
        assert.ok(draft.summary.length <= 200, draft.slug);
        assert.equal(typeof draft.shippable, 'boolean');
    }
});

test('her taslağın fotoğrafı depoda var ve kaynağı belirtilmiş', () => {
    for (const draft of PRODUCT_DRAFTS) {
        assert.match(draft.image, /^images\/urunler\/[a-z0-9-]+\.webp$/);
        assert.ok(existsSync(join(ROOT, draft.image)), draft.image);
        assert.match(draft.source, /^https:\/\/unsplash\.com\/photos\/[A-Za-z0-9_-]+$/);
    }
});
