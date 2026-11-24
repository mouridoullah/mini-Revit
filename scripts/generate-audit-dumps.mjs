import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();

// Liste des fichiers suivis ou à suivre (via git ls-files)
const gitOutput = execSync('git ls-files --cached --others --exclude-standard', {
  cwd: ROOT_DIR,
  encoding: 'utf-8',
  maxBuffer: 64 * 1024 * 1024,
});

const allTrackedFiles = gitOutput
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('.git') && !line.includes('node_modules/'))
  // Exclure les fichiers de dump eux-mêmes
  .filter((file) => {
    const base = path.basename(file).toLowerCase();
    if (base === 'arborescence.txt' || base === 'code source.txt' || base === 'fichiers markdown.txt') return false;
    if (base.startsWith('arborescence_') || base.startsWith('code source_') || base.startsWith('fichiers markdown_')) return false;
    return true;
  })
  .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

console.log(`Fichiers éligibles détectés : ${allTrackedFiles.length}`);

// 1. Génération de Arborescence.txt
console.log('Génération de Arborescence.txt...');
let totalBytes = 0;
const fileStats = [];

for (const relPath of allTrackedFiles) {
  const fullPath = path.join(ROOT_DIR, relPath);
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
      totalBytes += stat.size;
      fileStats.push({ relPath, size: stat.size });
    }
  } catch (err) {
    // Fichier non trouvé ou lien
  }
}

// Construction de l'arbre
function buildTree(files) {
  const rootNode = { name: 'mini-Revit', isDir: true, children: new Map(), size: 0 };
  for (const f of files) {
    const parts = f.relPath.split('/');
    let current = rootNode;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          isDir: !isFile,
          children: new Map(),
          size: isFile ? f.size : 0,
        });
      }
      current = current.children.get(part);
    }
  }
  return rootNode;
}

function renderTree(node, prefix = '') {
  let output = '';
  const entries = Array.from(node.children.values()).sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name, 'fr', { numeric: true });
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const branch = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (entry.isDir) {
      output += `${prefix}${branch}${entry.name}/\n`;
      output += renderTree(entry, prefix + childPrefix);
    } else {
      output += `${prefix}${branch}${entry.name} (${entry.size} B)\n`;
    }
  }
  return output;
}

const tree = buildTree(fileStats);
const treeString = renderTree(tree);

const nowIso = new Date().toISOString();
let branchName = 'unknown';
try {
  branchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
} catch (e) {}

let arborescenceContent = `================================================================================
AUDIT EXTERNE TABAX - ARBORESCENCE COMPLETE DU REPERTOIRE
Date d'extraction : ${nowIso}
Branche Git       : ${branchName}
Nombre de fichiers: ${fileStats.length}
Taille totale     : ${totalBytes} octets (${(totalBytes / (1024 * 1024)).toFixed(2)} Mo)
================================================================================

--- REPRESENTATION HIERARCHIQUE ---
mini-Revit/
${treeString}

--- LISTE PLATE DES FICHIERS ---
`;

for (let i = 0; i < fileStats.length; i++) {
  const f = fileStats[i];
  arborescenceContent += `[${String(i + 1).padStart(4, '0')}] ${f.relPath} (${f.size} octets)\n`;
}

fs.writeFileSync(path.join(ROOT_DIR, 'Arborescence.txt'), arborescenceContent, 'utf-8');
console.log('Arborescence.txt écrit avec succès.');

// 2. Génération de Fichiers Markdown.txt
console.log('Génération de Fichiers Markdown.txt...');
const markdownFiles = fileStats.filter((f) => f.relPath.toLowerCase().endsWith('.md') || f.relPath === 'LICENSE');

let markdownContent = `================================================================================
AUDIT EXTERNE TABAX - DUMP EXHAUSTIF DES DOCUMENTS MARKDOWN & SPECIFICATIONS
Date d'extraction : ${nowIso}
Branche Git       : ${branchName}
Nombre de documents: ${markdownFiles.length}
================================================================================

--- TABLE DES MATIERES ---
`;

for (let i = 0; i < markdownFiles.length; i++) {
  const f = markdownFiles[i];
  markdownContent += `[${String(i + 1).padStart(2, '0')}] ${f.relPath} (${f.size} octets)\n`;
}

markdownContent += `\n================================================================================\n\n`;

for (let i = 0; i < markdownFiles.length; i++) {
  const f = markdownFiles[i];
  const fullPath = path.join(ROOT_DIR, f.relPath);
  const rawText = fs.readFileSync(fullPath, 'utf-8');
  const lineCount = rawText.split('\n').length;

  markdownContent += `================================================================================\n`;
  markdownContent += `DOCUMENT [${i + 1}/${markdownFiles.length}] : ${f.relPath} (${f.size} octets, ${lineCount} lignes)\n`;
  markdownContent += `================================================================================\n\n`;
  markdownContent += rawText;
  if (!rawText.endsWith('\n')) markdownContent += '\n';
  markdownContent += '\n';
}

fs.writeFileSync(path.join(ROOT_DIR, 'Fichiers Markdown.txt'), markdownContent, 'utf-8');
console.log('Fichiers Markdown.txt écrit avec succès.');

// 3. Génération de Code source.txt
console.log('Génération de Code source.txt...');
// Fichiers sources : tout sauf markdown, binaires (wasm, png, etc.), et txt
const binaryExtensions = new Set(['.wasm', '.png', '.jpg', '.jpeg', '.ico', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot']);
const sourceFiles = fileStats.filter((f) => {
  const ext = path.extname(f.relPath).toLowerCase();
  if (ext === '.md' || f.relPath === 'LICENSE') return false;
  if (binaryExtensions.has(ext)) return false;
  if (f.relPath.endsWith('.txt')) return false;
  return true;
});

let totalSourceLines = 0;
const sourceFilesWithLines = [];

for (const f of sourceFiles) {
  const fullPath = path.join(ROOT_DIR, f.relPath);
  const rawText = fs.readFileSync(fullPath, 'utf-8');
  const lines = rawText.split('\n').length;
  totalSourceLines += lines;
  sourceFilesWithLines.push({ ...f, lines });
}

let codeSourceContent = `================================================================================
AUDIT EXTERNE TABAX - DUMP EXHAUSTIF DU CODE SOURCE
Date d'extraction : ${nowIso}
Branche Git       : ${branchName}
Nombre de fichiers: ${sourceFiles.length}
Nombre de lignes  : ${totalSourceLines}
================================================================================

--- TABLE DES MATIERES ---
`;

for (let i = 0; i < sourceFilesWithLines.length; i++) {
  const f = sourceFilesWithLines[i];
  codeSourceContent += `[${String(i + 1).padStart(3, '0')}] ${f.relPath} (${f.size} octets, ${f.lines} lignes)\n`;
}

codeSourceContent += `\n================================================================================\n\n`;

for (let i = 0; i < sourceFilesWithLines.length; i++) {
  const f = sourceFilesWithLines[i];
  const fullPath = path.join(ROOT_DIR, f.relPath);
  const rawText = fs.readFileSync(fullPath, 'utf-8');

  codeSourceContent += `================================================================================\n`;
  codeSourceContent += `FICHIER [${i + 1}/${sourceFilesWithLines.length}] : ${f.relPath} (${f.size} octets, ${f.lines} lignes)\n`;
  codeSourceContent += `================================================================================\n\n`;
  codeSourceContent += rawText;
  if (!rawText.endsWith('\n')) codeSourceContent += '\n';
  codeSourceContent += '\n';
}

fs.writeFileSync(path.join(ROOT_DIR, 'Code source.txt'), codeSourceContent, 'utf-8');
console.log('Code source.txt écrit avec succès.');
