import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@tabax/core';
import { Transform2D } from '@tabax/view-2d';
import { snapPoint, collectSnapCandidates } from './snap.js';
import { WallTool } from './WallTool.js';
import { SlabTool } from './SlabTool.js';
import { type ToolContext } from './types.js';

const vec = (x: number, y: number) => ({ x, y });

describe('Snapping Inter-Niveaux Underlay (apps/web/src/tools/snap-underlay.test.ts)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let levelRdcId: string;
  let levelR1Id: string;
  let wallTypeId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    levelRdcId = Object.keys(state.levels)[0]!;
    wallTypeId = Object.keys(state.wallTypes)[0]!;

    levelR1Id = 'lvl_r1';
    doc.execute(
      new Commands.AddLevelCommand({
        id: levelR1Id,
        name: 'Étage R+1',
        elevation: 3000,
        height: 2800,
      }),
    );

    // Mur porteur sur RDC : (0, 0) -> (5000, 0)
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_rdc_bearing',
        category: 'wall',
        typeId: wallTypeId,
        levelId: levelRdcId,
        start: vec(0, 0),
        end: vec(5000, 0),
      }),
    );

    transform = new Transform2D({
      scale: 0.05, // 1 px = 20 mm ; tolérance 12 px = 240 mm
      origin: vec(2500, 0),
      viewportWidth: 800,
      viewportHeight: 600,
    });
  });

  it('T-SNAP-U-01 — Curseur proche (<= 12 px écran) d’un sommet de mur underlay s’aimante exactement sur le sommet', () => {
    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: levelR1Id,
      underlayLevelId: levelRdcId,
      snapToUnderlay: true,
    };

    const candidates = collectSnapCandidates(ctx);
    const tolWorld = 12 / transform.scale; // 240 mm

    // Curseur à (5100, 50) mm -> distance à (5000, 0) = sqrt(100² + 50²) ≈ 111.8 mm <= 240 mm
    const cursor = vec(5100, 50);
    const result = snapPoint(cursor, candidates, tolWorld);

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 5000, y: 0 });
    expect(result.isUnderlay).toBe(true);
  });

  it('T-SNAP-U-02 — Curseur éloigné (> 12 px écran) ne s’aimante pas et préserve ses coordonnées brutes', () => {
    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: levelR1Id,
      underlayLevelId: levelRdcId,
      snapToUnderlay: true,
    };

    const candidates = collectSnapCandidates(ctx);
    const tolWorld = 12 / transform.scale; // 240 mm

    // Curseur à (5300, 100) mm -> distance = sqrt(300² + 100²) ≈ 316.2 mm > 240 mm
    const cursor = vec(5300, 100);
    const result = snapPoint(cursor, candidates, tolWorld);

    expect(result.snapped).toBe(false);
    expect(result.point).toEqual(cursor);
  });

  it('T-SNAP-U-03 — snapToUnderlay: false désactive l’aimantation aux sommets underlay', () => {
    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: levelR1Id,
      underlayLevelId: levelRdcId,
      snapToUnderlay: false, // Débrayé
    };

    const candidates = collectSnapCandidates(ctx);
    const tolWorld = 12 / transform.scale;

    // Curseur à (5050, 0) mm -> à 50 mm du mur underlay
    const cursor = vec(5050, 0);
    const result = snapPoint(cursor, candidates, tolWorld);

    expect(result.snapped).toBe(false);
    expect(result.point).toEqual(cursor);
  });

  it('T-SNAP-U-04 — Tolérance écran constante : l’emprise monde s’adapte rigoureusement au niveau de zoom', () => {
    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: levelR1Id,
      underlayLevelId: levelRdcId,
      snapToUnderlay: true,
    };

    // À scale = 0.05 (dézoomé), 12 px = 240 mm
    expect(12 / transform.scale).toBe(240);

    // À scale = 0.1 (zoomé 2x), 12 px = 120 mm
    transform.scale = 0.1;
    expect(12 / transform.scale).toBe(120);

    const candidates = collectSnapCandidates(ctx);
    const cursorAt150mm = vec(5150, 0);

    // À scale = 0.1, 150 mm > 120 mm -> pas de snap
    const resZoomed = snapPoint(cursorAt150mm, candidates, 12 / transform.scale);
    expect(resZoomed.snapped).toBe(false);

    // À scale = 0.05, 150 mm <= 240 mm -> snap actif
    transform.scale = 0.05;
    const resUnzoomed = snapPoint(cursorAt150mm, candidates, 12 / transform.scale);
    expect(resUnzoomed.snapped).toBe(true);
    expect(resUnzoomed.point).toEqual({ x: 5000, y: 0 });
  });

  it('T-SNAP-U-05 — WallTool s’aimante sur un sommet underlay N-1 au départ et à l’arrivée', () => {
    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: levelR1Id,
      activeWallTypeId: wallTypeId,
      underlayLevelId: levelRdcId,
      snapToUnderlay: true,
    };

    const tool = new WallTool();

    // 1. Début de tracé à proximité de (0, 0)
    // Coordonnées écran pour monde (50, 30) mm
    const sStart = transform.worldToScreen(vec(50, 30));
    tool.handle({ type: 'pointerdown', screen: sStart, button: 0, shift: false, alt: false }, ctx);

    const st1 = tool.getState();
    expect(st1.kind).toBe('drawing');
    if (st1.kind === 'drawing') {
      // Snappé à (0, 0)
      expect(st1.startWorld).toEqual({ x: 0, y: 0 });
    }

    // 2. Relâchement à proximité de (5000, 0) -> monde (4950, -40) mm
    const sEnd = transform.worldToScreen(vec(4950, -40));
    const out = tool.handle(
      { type: 'pointerup', screen: sEnd, button: 0, shift: false, alt: false },
      ctx,
    );

    expect(out.kind).toBe('command');
    if (out.kind === 'command') {
      const addWallCmd = out.command as Commands.AddWallCommand;
      expect(addWallCmd.wall.start).toEqual({ x: 0, y: 0 });
      expect(addWallCmd.wall.end).toEqual({ x: 5000, y: 0 });
      expect(addWallCmd.wall.levelId).toBe(levelR1Id);
    }
  });

  it('T-SNAP-U-06 — SlabTool s’aimante sur les sommets des murs underlay N-1', () => {
    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: levelR1Id,
      activeSlabTypeId: 'default-slab-type',
      underlayLevelId: levelRdcId,
      snapToUnderlay: true,
    };

    const tool = new SlabTool();

    // Clic près de (0, 0)
    const s1 = transform.worldToScreen(vec(30, 20));
    tool.handle({ type: 'pointerdown', screen: s1, button: 0, shift: false, alt: false }, ctx);

    const st = tool.getState();
    expect(st.kind).toBe('drawing');
    if (st.kind === 'drawing') {
      expect(st.points[0]).toEqual({ x: 0, y: 0 });
    }
  });

  it('T-SNAP-U-07 — Priorité d’arbitrage : à distance égale, le sommet du niveau actif prime sur l’underlay', () => {
    // Ajouter un mur sur R+1 qui a aussi un sommet à (5000, 0)
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_r1_local',
        category: 'wall',
        typeId: wallTypeId,
        levelId: levelR1Id,
        start: vec(5000, 0),
        end: vec(5000, 3000),
      }),
    );

    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: levelR1Id,
      underlayLevelId: levelRdcId,
      snapToUnderlay: true,
    };

    const candidates = collectSnapCandidates(ctx);
    const tolWorld = 12 / transform.scale;

    // Curseur exactement à (5050, 0) : équidistant de w_rdc_bearing.end et w_r1_local.start
    const res = snapPoint(vec(5050, 0), candidates, tolWorld);
    expect(res.snapped).toBe(true);
    expect(res.point).toEqual({ x: 5000, y: 0 });
    // Doit être non-underlay (priorité locale)
    expect(res.isUnderlay).toBe(false);
  });
});
