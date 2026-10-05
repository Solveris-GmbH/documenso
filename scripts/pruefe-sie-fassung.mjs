#!/usr/bin/env node
// Solveris-Fassung: prüft, dass die deutsche Übersetzung siezt.
//
//   node scripts/pruefe-sie-fassung.mjs            # alle Treffer ausgeben, Exit 1 bei Treffern
//   node scripts/pruefe-sie-fassung.mjs --zahl     # nur Zählung
//
// Geprüft wird jede msgstr in packages/lib/translations/de/*.po auf
//   1. Du-Pronomen (du, dich, dir, dein*, euch, euer/eure*),
//   2. Verbformen der 2. Person Singular (bist, hast, kannst, ...),
//   3. Imperative in Du-Form (Klicke, Gib, Wähle, ...), sofern nicht "Sie" folgt,
// und je Eintrag, dass die Platzhalter ({name}, <0/>, <0>…</0>) der msgstr zur
// msgid passen. Ein Platzhalter-Unterschied, der schon in der Originalfassung
// v2.19.0 bestand, wird nur gemeldet, nicht gezählt (keine neue Abweichung).
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'packages/lib/translations/de');
const BASIS_TAG = 'v2.19.0';

const L = '\\p{L}';
const wort = (liste) => new RegExp(`(?<!${L})(${liste.join('|')})(?!${L})`, 'giu');

const PRONOMEN = wort([
  'du', 'dich', 'dir', 'dein', 'deine', 'deinen', 'deinem', 'deiner', 'deines',
  'euch', 'euer', 'eure', 'euren', 'eurem', 'eurer', 'eures',
]);

const VERB_2SG = wort([
  'bist', 'hast', 'kannst', 'musst', 'willst', 'wirst', 'darfst', 'sollst', 'solltest',
  'möchtest', 'könntest', 'würdest', 'hättest', 'wärst', 'warst', 'wurdest', 'weißt',
  'brauchst', 'siehst', 'ansiehst', 'findest', 'gibst', 'nimmst', 'klickst', 'bearbeitest',
  'signierst', 'unterschreibst', 'unterzeichnest', 'herunterlädst', 'lädst', 'genehmigst',
  'erhältst', 'bekommst', 'angehörtest', 'gehörst', 'verwendest', 'erstellst', 'versuchst',
  'fährst', 'kehrst', 'gehst', 'kommst', 'sendest', 'teilst', 'wählst', 'öffnest',
]);

// Du-Imperative; zählen nur, wenn nicht "Sie" folgt ("Klicken Sie" ist korrekt,
// "Klicke" nicht).
const IMPERATIV = new RegExp(
  `(?<!${L})(${[
    'klicke', 'gib', 'wähle', 'füge', 'gehe', 'geh', 'lade', 'melde', 'lies', 'nimm', 'sieh',
    'schau', 'bestätige', 'überprüfe', 'prüfe', 'kontaktiere', 'versuche', 'stelle', 'erstelle',
    'öffne', 'kopiere', 'lösche', 'aktualisiere', 'wende', 'sende', 'schließe', 'fahre', 'scanne',
    'speichere', 'hinterlege', 'trage', 'verwende', 'nutze', 'kehre', 'fülle', 'lege', 'richte',
    'beachte', 'vergewissere', 'folge', 'navigiere', 'starte', 'zeichne', 'unterschreibe',
    'unterzeichne', 'organisiere', 'warte', 'erlaube', 'blockiere', 'akzeptiere', 'aktiviere',
    'deaktiviere', 'tritt', 'hilf', 'entferne', 'bearbeite', 'ändere', 'verwalte', 'signiere',
    'drücke', 'tippe', 'behalte', 'vergiss', 'setze', 'lade', 'teile', 'suche', 'gestalte',
    'erhalte', 'schicke', 'frage', 'informiere', 'lass', 'lasse', 'mach', 'mache', 'probiere',
    'schreibe', 'sichere', 'synchronisiere', 'verbinde', 'verifiziere', 'wiederhole', 'zögere',
  ].join('|')})(?!${L})(?!\\s+Sie(?!${L}))`,
  'giu',
);

// Fest gesetzte Begriffe, die zufällig wie ein Imperativ aussehen (nur exakt diese msgstr).
const AUSNAHMEN = new Set([
  // Ich-Form ("zur Verfügung stelle"), kein Imperativ.
  'Ich verstehe, dass ich meine Anmeldedaten einem Drittanbieter-Service zur Verfügung stelle, der von dieser Organisation konfiguriert wurde.',
]);

function lesePo(text) {
  const eintraege = [];
  let msgid = null;
  let zeileNr = 0;
  const zeilen = text.split('\n');
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (z.startsWith('msgid "')) {
      msgid = JSON.parse(z.slice(6));
    } else if (z.startsWith('msgstr "')) {
      zeileNr = i + 1;
      let msgstr = JSON.parse(z.slice(7));
      while (i + 1 < zeilen.length && zeilen[i + 1].startsWith('"')) {
        msgstr += JSON.parse(zeilen[++i]);
      }
      if (msgid !== '') eintraege.push({ msgid, msgstr, zeile: zeileNr });
    }
  }
  return eintraege;
}

function platzhalter(s) {
  const p = [];
  for (const m of s.matchAll(/\{([A-Za-z_][\w.]*)\s*[},]/g)) p.push(`{${m[1]}}`);
  for (const m of s.matchAll(/<\/?\d+\/?>/g)) p.push(m[0]);
  return p.sort().join(' ');
}

const nurZahl = process.argv.includes('--zahl');
let treffer = 0;
let platzFehler = 0;
let platzAlt = 0;
const ausgabe = [];

for (const datei of readdirSync(DIR).filter((d) => d.endsWith('.po'))) {
  const pfad = join(DIR, datei);
  const rel = relative(ROOT, pfad);
  const eintraege = lesePo(readFileSync(pfad, 'utf8'));
  let basis = new Map();
  try {
    const alt = execFileSync('git', ['show', `${BASIS_TAG}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
    basis = new Map(lesePo(alt).map((e) => [e.msgid, e.msgstr]));
  } catch {
    // Kein Tag verfügbar: dann wird jede Platzhalter-Abweichung gezählt.
  }

  for (const { msgid, msgstr, zeile } of eintraege) {
    if (!msgstr || AUSNAHMEN.has(msgstr)) continue;
    const funde = [];
    for (const re of [PRONOMEN, VERB_2SG, IMPERATIV]) {
      for (const m of msgstr.matchAll(re)) funde.push(m[1]);
    }
    if (funde.length) {
      treffer += funde.length;
      ausgabe.push(`${rel}:${zeile}  [${funde.join(', ')}]  ${msgstr}`);
    }
    const soll = platzhalter(msgid);
    const ist = platzhalter(msgstr);
    if (soll !== ist) {
      const alt = basis.get(msgid);
      if (alt !== undefined && platzhalter(alt) === ist) {
        platzAlt++;
      } else {
        platzFehler++;
        ausgabe.push(`${rel}:${zeile}  PLATZHALTER msgid=[${soll}] msgstr=[${ist}]  ${msgstr}`);
      }
    }
  }
}

if (!nurZahl) for (const a of ausgabe) console.log(a);
console.log(`Du-Treffer: ${treffer}`);
console.log(`neue Platzhalter-Abweichungen: ${platzFehler} (schon in ${BASIS_TAG} vorhanden, nicht gezählt: ${platzAlt})`);
process.exit(treffer + platzFehler > 0 ? 1 : 0);
