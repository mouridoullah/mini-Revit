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

    const forbiddenGeometry = /from\s+['"]@mini-bim\/geometry['"]/i;

    for (const file of dagFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const hasForbidden = forbiddenGeometry.test(content);
      expect(hasForbidden, `Forbidden @tabax/geometry import in DAG/relations: ${file}`).toBe(
        false,
      );
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
});
