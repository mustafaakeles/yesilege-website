// Migration'ları ve SQL testlerini bellek içi Postgres'te (PGlite) çalıştırır; Supabase hesabı gerekmez.
// Supabase'in sağladığı auth şeması, roller ve storage tablosu en küçük hâliyle taklit edilir (tools/pglite_db.mjs).
// Çalıştırma: npm install --no-save --package-lock=false @electric-sql/pglite@0.3.15
//            node tools/run_sql_tests.mjs
import { createDatabase, readSql, sqlFiles } from './pglite_db.mjs';

let db;
let failed = false;
try {
    db = await createDatabase({ onMigration: file => console.log(`✓ ${file}`) });
    for (const file of sqlFiles('supabase/tests')) {
        const notices = [];
        try {
            await db.exec(readSql(file), { onNotice: notice => notices.push(notice.message) });
            const passed = notices.filter(message => /testleri geçti/.test(message));
            console.log(`✓ ${file}${passed.length ? ` (${passed.at(-1)})` : ''}`);
        } catch (error) {
            failed = true;
            console.error(`✖ ${file}: ${error.message}`);
            await db.exec('rollback').catch(() => {});
        }
    }
} catch (error) {
    failed = true;
    console.error(`✖ ${error.message}`);
} finally {
    await db?.close();
}
if (failed) process.exit(1);
console.log('Veritabanı testleri tamamlandı.');
