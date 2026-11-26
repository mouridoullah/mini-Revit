import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function scanDir(dir: string, fileRegex: RegExp): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanDir(full, fileRegex));
    } else if (entry.isFile() && fileRegex.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('Pureté Architecturale et Absence de Dépendance Parasite (T-PUR-01 à 04)', () => {
  it('T-PUR-01: packages/core/src ne contient aucun import de react, react-dom ou three', () => {
    const coreSrcDir = path.resolve(__dirname);
    const tsFiles = scanDir(coreSrcDir, /\.(ts|tsx)$/);

    const forbiddenRegex = /from\s+['"](react|react-dom|three)['"]/i;

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const hasForbidden = forbiddenRegex.test(content);
      expect(hasForbidden, `Forbidden framework import detected in: ${file}`).toBe(false);
    }
  });

  it('T-PUR-02: packages/core/src/dag et src/relations ne dépendent PAS de @tabax/geometry', () => {
    const dagDir = path.resolve(__dirname, 'dag');
    const relDir = path.resolve(__dirname, 'relations');

    const dagFiles = [...scanDir(dagDir, /\.(ts|tsx)$/), ...scanDir(relDir, /\.(ts|tsx)$/)];

    const forbiddenGeometry = /from\s+['"]@tabax\/geometry['"]/i;

    for (const file of dagFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const hasForbidden = forbiddenGeometry.test(content);
      expect(hasForbidden, `Forbidden @tabax/geometry import in DAG/relations: ${file}`).toBe(
        false,
      );
    }
  });

  it('T-PUR-02-WEB: apps/web/src ne dépend PAS directement de @tabax/geometry (ADR-022)', () => {
    const webSrcDir = path.resolve(__dirname, '../../apps/web/src');
    const webFiles = scanDir(webSrcDir, /\.(ts|tsx)$/);

    const forbiddenGeometry = /from\s+['"]@tabax\/geometry['"]/i;

    for (const file of webFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const hasForbidden = forbiddenGeometry.test(content);
      expect(hasForbidden, `Forbidden @tabax/geometry import in web app: ${file}`).toBe(false);
    }
  });

  it("T-PURE-MOVE-01: geometry/src/junctions/stretch.ts n'importe ni React ni Three ni DOM", () => {
    const stretchFile = path.resolve(__dirname, '../../geometry/src/junctions/stretch.ts');
    const content = fs.readFileSync(stretchFile, 'utf8');
    const forbidden = /from\s+['"](react|react-dom|three)['"]/i;
    expect(forbidden.test(content)).toBe(false);
  });

  it("T-PURE-MOVE-02: core/src/commands.ts n'importe ni React ni Three ni DOM ni geometry/mesh", () => {
    const commandsFile = path.resolve(__dirname, 'commands.ts');
    const content = fs.readFileSync(commandsFile, 'utf8');
    const forbidden = /from\s+['"](react|react-dom|three|.*\/mesh.*)['"]/i;
    expect(forbidden.test(content)).toBe(false);
  });

  it('T-PUR-03-AI: packages/ai/src est pur (zéro React, Three, @tabax/geometry, @tabax/view-*, window ou document)', () => {
    const aiSrcDir = path.resolve(__dirname, '../../ai/src');
    const tsFiles = scanDir(aiSrcDir, /\.(ts|tsx)$/).filter((f) => !f.endsWith('.test.ts'));
    expect(tsFiles.length).toBeGreaterThan(0);

    const forbiddenImports =
      /from\s+['"](react|react-dom|three|@tabax\/geometry|@tabax\/view-2d|@tabax\/view-3d)['"]/i;
    const forbiddenDomGlobals = /\b(window|document)\b/;

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(forbiddenImports.test(content), `Forbidden import in @tabax/ai: ${file}`).toBe(false);
      // Retirer commentaires et littéraux de chaînes (ex. category: 'window' BIM) avant de scanner les globaux DOM
      const codeOnly = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/(['"`])(?:\\.|(?!\1)[^\\\r\n])*\1/g, '');
      expect(forbiddenDomGlobals.test(codeOnly), `Forbidden DOM global in @tabax/ai: ${file}`).toBe(
        false,
      );
    }
  });
});
