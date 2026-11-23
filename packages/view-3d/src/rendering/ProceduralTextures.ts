/**
 * ProceduralTextures
 *
 * Génère une fois au démarrage toutes les textures PBR procédurales via CanvasTexture.
 * Chaque texture est mise en cache et réutilisée (matériaux partagés — ADR-050).
 */

import * as THREE from 'three';

/** Résolution de base des textures procédurales (en pixels). */
const TEX_SIZE = 256;

function makeCanvas(size: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(size, size);
  }
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function getContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('[ProceduralTextures] Cannot get 2D context');
  return ctx;
}

function buildTexture(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  renderer: THREE.WebGLRenderer,
  repeatX = 4,
  repeatY = 4,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

/** Enduit architectural fin (murs & plafonds). */
function makeEnduitTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = makeCanvas(TEX_SIZE);
  const ctx = getContext(canvas);
  ctx.fillStyle = '#c8c4bc';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // Grain fin aléatoire
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * TEX_SIZE;
    const y = Math.random() * TEX_SIZE;
    const v = Math.floor(Math.random() * 30) - 15;
    const c = 200 + v;
    const a = 0.03 + Math.random() * 0.05;
    ctx.fillStyle = `rgba(${c},${c - 2},${c - 4},${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  return buildTexture(canvas, renderer, 8, 8);
}

/** Béton banché (dalles, voiles). */
function makeBetonTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = makeCanvas(TEX_SIZE);
  const ctx = getContext(canvas);
  ctx.fillStyle = '#d1d5db';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // Coffrages horizontaux
  for (let y = 0; y < TEX_SIZE; y += 32) {
    ctx.strokeStyle = 'rgba(150,155,165,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEX_SIZE, y);
    ctx.stroke();
  }
  // Grain béton
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * TEX_SIZE;
    const y = Math.random() * TEX_SIZE;
    const r = Math.random() * 1.5;
    const v = Math.floor(Math.random() * 25) - 12;
    const c = 209 + v;
    ctx.fillStyle = `rgba(${c},${c + 1},${c + 3},0.6)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return buildTexture(canvas, renderer, 6, 6);
}

/** Parquet chêne clair (séjours, chambres). */
function makeParquetTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = makeCanvas(TEX_SIZE);
  const ctx = getContext(canvas);
  ctx.fillStyle = '#c8a97e';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const lames = 6;
  const lameH = TEX_SIZE / lames;
  for (let row = 0; row < lames; row++) {
    const baseColor = 180 + (row % 3) * 8;
    ctx.fillStyle = `rgb(${baseColor + 20},${baseColor - 10},${baseColor - 50})`;
    ctx.fillRect(0, row * lameH, TEX_SIZE, lameH - 1);
    // Veinures
    for (let v = 0; v < 5; v++) {
      const sx = Math.random() * TEX_SIZE;
      const ex = Math.random() * TEX_SIZE;
      const sy = row * lameH + Math.random() * lameH;
      ctx.strokeStyle = `rgba(100,65,30,0.15)`;
      ctx.lineWidth = 0.5 + Math.random();
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + 20, sy + 2, ex - 20, sy - 2, ex, sy);
      ctx.stroke();
    }
    // Joint de lame
    ctx.fillStyle = 'rgba(60,35,10,0.3)';
    ctx.fillRect(0, row * lameH + lameH - 1, TEX_SIZE, 1);
  }
  return buildTexture(canvas, renderer, 4, 4);
}

/** Carrelage gris doux (SDB, WC, cuisines). */
function makeCarrelageTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = makeCanvas(TEX_SIZE);
  const ctx = getContext(canvas);
  const tileSize = 64;
  const cols = TEX_SIZE / tileSize;
  const rows = TEX_SIZE / tileSize;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = Math.floor(Math.random() * 15) - 7;
      const base = 220 + v;
      ctx.fillStyle = `rgb(${base},${base},${base})`;
      ctx.fillRect(c * tileSize + 1, r * tileSize + 1, tileSize - 2, tileSize - 2);
    }
  }
  // Joints
  ctx.fillStyle = '#a0a5b0';
  for (let r = 0; r <= rows; r++) {
    ctx.fillRect(0, r * tileSize, TEX_SIZE, 2);
  }
  for (let c = 0; c <= cols; c++) {
    ctx.fillRect(c * tileSize, 0, 2, TEX_SIZE);
  }
  return buildTexture(canvas, renderer, 5, 5);
}

/** Tole galvanisee brossee (gaines CVC). */
function makeToleGalvaTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = makeCanvas(TEX_SIZE);
  const ctx = getContext(canvas);
  ctx.fillStyle = '#c0c8d0';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // Rayures de brossage
  for (let y = 0; y < TEX_SIZE; y += 2) {
    const v = Math.floor(Math.random() * 20) - 10;
    const c = 192 + v;
    ctx.strokeStyle = `rgba(${c},${c + 2},${c + 8},0.4)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEX_SIZE, y);
    ctx.stroke();
  }
  return buildTexture(canvas, renderer, 3, 3);
}

/** Bois chaleureux (mobilier). */
function makeBoisTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = makeCanvas(TEX_SIZE);
  const ctx = getContext(canvas);
  ctx.fillStyle = '#a0714a';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < 20; i++) {
    const y = Math.random() * TEX_SIZE;
    ctx.strokeStyle = `rgba(80,45,15,0.2)`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      TEX_SIZE * 0.25,
      y + (Math.random() - 0.5) * 10,
      TEX_SIZE * 0.75,
      y + (Math.random() - 0.5) * 10,
      TEX_SIZE,
      y + (Math.random() - 0.5) * 5,
    );
    ctx.stroke();
  }
  return buildTexture(canvas, renderer, 4, 4);
}

// ----------------------------------------------------------------------------
// Cache singleton
// ----------------------------------------------------------------------------

export interface ProceduralTextureSet {
  enduit: THREE.CanvasTexture;
  beton: THREE.CanvasTexture;
  parquet: THREE.CanvasTexture;
  carrelage: THREE.CanvasTexture;
  toleGalva: THREE.CanvasTexture;
  bois: THREE.CanvasTexture;
}

let _cache: ProceduralTextureSet | null = null;

/**
 * Retourne (et crée si besoin) le jeu complet de textures PBR procédurales.
 * Les textures sont partagées — ne jamais appeler .dispose() dessus individuellement.
 */
export function getProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  if (_cache) return _cache;
  _cache = {
    enduit: makeEnduitTexture(renderer),
    beton: makeBetonTexture(renderer),
    parquet: makeParquetTexture(renderer),
    carrelage: makeCarrelageTexture(renderer),
    toleGalva: makeToleGalvaTexture(renderer),
    bois: makeBoisTexture(renderer),
  };
  return _cache;
}

/** Libère toutes les textures procédurales (appeler dans Scene3D.dispose()). */
export function disposeProceduralTextures(): void {
  if (!_cache) return;
  for (const tex of Object.values(_cache)) {
    tex.dispose();
  }
  _cache = null;
}
