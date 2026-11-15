import { type Vec2, vec2, distance } from '@mini-bim/geometry';
import { Transform2D } from './transform.js';
import { renderPlanView, DEFAULT_VIEW2D_RENDER_CONFIG } from './renderer.js';
import { findWallAtScreen } from './hit-test.js';
import { UnderlayCache, type UnderlayInput } from './underlay/UnderlayCache.js';
import {
  type View2DOptions,
  type View2DRenderConfig,
  type CommandCallback,
  type SelectionCallback,
  type BoundingBox2D,
  type PreviewShape,
  type DocumentFor2D,
  type CommandLike,
  type OpeningFor2D,
  type DetectedRoomFor2D,
  type DimensionFor2D,
  type SlabFor2D,
} from './types.js';

/**
 * Visualiseur et contrôleur impératif de vue en plan 2D pour Mini-BIM.
 *
 * Principes architecturaux stricts :
 * 1. Zéro dépendance vers React, Three.js ou tout framework UI.
 * 2. Zéro dépendance directe vers @mini-bim/core (consomme des interfaces neutres).
 * 3. Utilisation exclusive de la standard Canvas 2D API (`HTMLCanvasElement`, `CanvasRenderingContext2D`).
 * 4. Ne mute JAMAIS le modèle en direct : émet des intentions de mutation (`CommandLike`)
 *    via le système de callback `onCommandRequested`.
 * 5. Rendu à la demande (Demand-Driven Rendering) : zéro boucle RAF continue consommant du CPU au repos.
 */
export class View2D {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly transform: Transform2D;
  private config: View2DRenderConfig;
  private doc: DocumentFor2D | null = null;
  private openings: OpeningFor2D[] = [];
  private rooms: DetectedRoomFor2D[] = [];
  private dimensions: DimensionFor2D[] = [];
  private slabs: SlabFor2D[] = [];
  private selectedIds: Set<string> = new Set();
  private activeLevelId: string | null = null;
  private underlayLevelId: string | null = null;
  private readonly underlayCache: UnderlayCache = new UnderlayCache();
  private preview: PreviewShape | null = null;
  private readonly enableInternalSelection: boolean;

  // Gestion de l'interaction pointeur
  private isPanning: boolean = false;
  private lastPointerPos: Vec2 = vec2(0, 0);
  private pointerDownPos: Vec2 = vec2(0, 0);

  // Abonnements découplés
  private readonly commandListeners: Set<CommandCallback> = new Set();
  private readonly selectionListeners: Set<SelectionCallback> = new Set();
  private readonly cleanupFns: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;

  public constructor(canvas: HTMLCanvasElement, options?: View2DOptions) {
    this.canvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Impossible d’acquérir le contexte de rendu CanvasRenderingContext2D.');
    }
    this.ctx = ctx;

    const initialWidth =
      canvas.width > 0 ? canvas.width : (options?.transform?.viewportWidth ?? 800);
    const initialHeight =
      canvas.height > 0 ? canvas.height : (options?.transform?.viewportHeight ?? 600);

    this.transform = new Transform2D({
      ...options?.transform,
      viewportWidth: initialWidth,
      viewportHeight: initialHeight,
    });

    this.config = {
      backgroundColor:
        options?.renderConfig?.backgroundColor ?? DEFAULT_VIEW2D_RENDER_CONFIG.backgroundColor,
      showAxes: options?.renderConfig?.showAxes ?? DEFAULT_VIEW2D_RENDER_CONFIG.showAxes,
      grid: { ...DEFAULT_VIEW2D_RENDER_CONFIG.grid, ...options?.renderConfig?.grid },
      wall: { ...DEFAULT_VIEW2D_RENDER_CONFIG.wall, ...options?.renderConfig?.wall },
    };

    this.activeLevelId = options?.activeLevelId ?? null;
    this.underlayLevelId = options?.underlayLevelId ?? null;
    this.enableInternalSelection = options?.enableInternalSelection ?? true;

    this.attachEventListeners();
    this.setupResizeObserver();
  }

  // ---------------------------------------------------------------------------
  // Accesseurs
  // ---------------------------------------------------------------------------

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  public getTransform(): Transform2D {
    return this.transform;
  }

  public getDocument(): DocumentFor2D | null {
    return this.doc;
  }

  public setDocument(doc: DocumentFor2D | null): void {
    this.doc = doc;
    this.render();
  }

  /**
   * Définit explicitement les ouvertures à afficher en 2D (portes et fenêtres).
   * Si non défini, les ouvertures sont automatiquement extraites de `doc.getState().doors/windows`.
   */
  public setOpenings(openings: Iterable<OpeningFor2D>): void {
    this.openings = Array.from(openings);
    this.render();
  }

  /**
   * Retourne la liste des ouvertures actuellement configurées explicitement.
   */
  public getOpenings(): readonly OpeningFor2D[] {
    return this.openings;
  }

  /**
   * Configure les pièces détectées ou déclarées pour affichage (poché pastel et libellés).
   */
  public setRooms(rooms: readonly DetectedRoomFor2D[]): void {
    this.rooms = [...rooms];
    this.render();
  }

  /**
   * Alias conforme à la spec pour définir les libellés et emprises des pièces.
   */
  public setRoomLabels(rooms: readonly DetectedRoomFor2D[]): void {
    this.setRooms(rooms);
  }

  public getRooms(): readonly DetectedRoomFor2D[] {
    return this.rooms;
  }

  /**
   * Configure les cotations 2D explicites à afficher en plan.
   */
  public setDimensions(dimensions: readonly DimensionFor2D[]): void {
    this.dimensions = [...dimensions];
    this.render();
  }

  public getDimensions(): readonly DimensionFor2D[] {
    return this.dimensions;
  }

  public setSlabs(slabs: readonly SlabFor2D[]): void {
    this.slabs = Array.from(slabs);
    this.render();
  }

  public getSlabs(): readonly SlabFor2D[] {
    return this.slabs;
  }

  public getSelectedIds(): readonly string[] {
    return Array.from(this.selectedIds);
  }

  public setSelectedIds(ids: Iterable<string>): void {
    this.selectedIds = new Set(ids);
    this.notifySelectionChanged();
    this.render();
  }

  /**
   * Alias de sélection d'éléments pour conformité avec l'API des Tools.
   */
  public setSelection(ids: Iterable<string>): void {
    this.setSelectedIds(ids);
  }

  /**
   * Définit ou efface la forme de prévisualisation temporaire (rubber-band) et rafraîchit la vue.
   */
  public setPreview(preview: PreviewShape | null): void {
    this.preview = preview;
    this.render();
  }

  /**
   * Retourne la forme de prévisualisation courante, ou null.
   */
  public getPreview(): PreviewShape | null {
    return this.preview;
  }

  public getActiveLevelId(): string | null {
    return this.activeLevelId;
  }

  public setActiveLevelId(levelId: string | null): void {
    this.activeLevelId = levelId;
    this.render();
  }

  public getUnderlayLevelId(): string | null {
    return this.underlayLevelId;
  }

  public setUnderlayLevelId(levelId: string | null): void {
    this.underlayLevelId = levelId;
    this.render();
  }

  public getUnderlayCache(): UnderlayCache {
    return this.underlayCache;
  }

  public invalidateUnderlayCache(changedIds?: readonly string[]): void {
    this.underlayCache.invalidate(changedIds);
  }

  // ---------------------------------------------------------------------------
  // Rendu à la demande (Demand-Driven Rendering)
  // ---------------------------------------------------------------------------

  /**
   * Rafraîchit immédiatement l'affichage sur le Canvas 2D.
   */
  public render(doc?: DocumentFor2D, selectedIds?: Iterable<string>): void {
    if (doc !== undefined) {
      this.doc = doc;
    }
    if (selectedIds !== undefined) {
      this.selectedIds = new Set(selectedIds);
    }

    const effectiveDoc = this.doc ?? this.createEmptyPlaceholderDoc();
    const effectiveOpenings = this.openings.length > 0 ? this.openings : undefined;
    const effectiveRooms = this.rooms.length > 0 ? this.rooms : undefined;
    const effectiveDimensions = this.dimensions.length > 0 ? this.dimensions : undefined;
    const effectiveSlabs = this.slabs.length > 0 ? this.slabs : undefined;

    let underlayPath: Path2D | null = null;
    if (this.underlayLevelId) {
      const state = effectiveDoc.getState();
      const underlayWalls = Object.values(state.walls ?? {})
        .filter((w) => w.levelId === this.underlayLevelId)
        .map((w) => ({
          id: w.id,
          start: w.start,
          end: w.end,
          thickness: (w.typeId ? state.wallTypes?.[w.typeId]?.thickness : undefined) ?? 200,
        }));

      const underlayDoors = Object.values(state.doors ?? {})
        .filter((d) => {
          const host = state.walls?.[d.hostWallId];
          return host && host.levelId === this.underlayLevelId;
        })
        .map((d) => {
          const dt = d.doorTypeId ? state.doorTypes?.[d.doorTypeId] : undefined;
          return {
            id: d.id,
            hostWallId: d.hostWallId,
            offsetAlong: d.offsetAlong,
            width: dt?.width ?? 900,
            swing: d.swing,
          };
        });

      const underlayWindows = Object.values(state.windows ?? {})
        .filter((w) => {
          const host = state.walls?.[w.hostWallId];
          return host && host.levelId === this.underlayLevelId;
        })
        .map((w) => {
          const wt = w.windowTypeId ? state.windowTypes?.[w.windowTypeId] : undefined;
          return {
            id: w.id,
            hostWallId: w.hostWallId,
            offsetAlong: w.offsetAlong,
            width: wt?.width ?? 1200,
          };
        });

      const underlayInput: UnderlayInput = {
        levelId: this.underlayLevelId,
        walls: underlayWalls,
        doors: underlayDoors,
        windows: underlayWindows,
      };

      underlayPath = this.underlayCache.getOrCompile(underlayInput);
    }

    renderPlanView(
      this.ctx,
      this.transform,
      effectiveDoc,
      this.selectedIds,
      this.config,
      this.activeLevelId,
      this.preview,
      effectiveOpenings,
      effectiveRooms,
      effectiveDimensions,
      effectiveSlabs,
      underlayPath,
    );
  }

  /**
   * Alias de commodité pour rafraîchir l'affichage avec l'état courant.
   */
  public update(): void {
    this.render();
  }

  /**
   * Recadre la vue sur l'ensemble des éléments modélisés (ou sur une zone par défaut).
   */
  public zoomToFit(paddingPx: number = 40): void {
    if (!this.doc) return;

    const walls = Object.values(this.doc.getState().walls);
    if (walls.length === 0) {
      this.transform.zoomToFit(
        {
          min: vec2(-3000, -3000),
          max: vec2(3000, 3000),
        },
        paddingPx,
      );
      this.render();
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const wall of walls) {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      minY = Math.min(minY, wall.start.y, wall.end.y);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      maxY = Math.max(maxY, wall.start.y, wall.end.y);
    }

    const bounds: BoundingBox2D = {
      min: vec2(minX, minY),
      max: vec2(maxX, maxY),
    };

    this.transform.zoomToFit(bounds, paddingPx);
    this.render();
  }

  /**
   * Ajuste la résolution et l'affichage lors d'un redimensionnement externe du canvas.
   */
  public resize(width: number, height: number): void {
    const validW = Math.max(1, Math.floor(width));
    const validH = Math.max(1, Math.floor(height));

    if (this.canvas.width !== validW || this.canvas.height !== validH) {
      this.canvas.width = validW;
      this.canvas.height = validH;
    }

    this.transform.setViewportSize(validW, validH);
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Événements & Command Pattern Découplé
  // ---------------------------------------------------------------------------

  /**
   * Enregistre un écouteur notifié lorsqu'une commande de modification est sollicitée par la vue.
   * Règle d'or : View2D n'exécute JAMAIS directement la commande sur BimDocument.
   *
   * @returns Fonction de désinscription.
   */
  public onCommandRequested(callback: CommandCallback): () => void {
    this.commandListeners.add(callback);
    return () => {
      this.commandListeners.delete(callback);
    };
  }

  /**
   * Émet une intention de commande vers les abonnés (le contrôleur ou l'application hôte).
   */
  public emitCommand(command: CommandLike): void {
    for (const listener of this.commandListeners) {
      try {
        listener(command);
      } catch (err) {
        console.error('Erreur dans un gestionnaire onCommandRequested:', err);
      }
    }
  }

  /**
   * Enregistre un écouteur notifié lors d'une modification de la sélection.
   */
  public onSelectionChanged(callback: SelectionCallback): () => void {
    this.selectionListeners.add(callback);
    return () => {
      this.selectionListeners.delete(callback);
    };
  }

  private notifySelectionChanged(): void {
    const ids = Array.from(this.selectedIds);
    for (const listener of this.selectionListeners) {
      try {
        listener(ids);
      } catch (err) {
        console.error('Erreur dans un gestionnaire onSelectionChanged:', err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Hit-Testing (Détection de Clic sur Éléments)
  // ---------------------------------------------------------------------------

  /**
   * Détecte l'élément architectural situé sous une coordonnée écran du canvas.
   * Délègue à la fonction pure et partagée `findWallAtScreen` (hit-test.ts).
   *
   * @param screenPos Position en pixels dans l'espace écran du canvas.
   * @param hitTolerancePx Tolérance de clic en pixels (défaut : 6 px).
   * @returns L'identifiant du mur touché, ou null.
   */
  public hitTest(screenPos: Vec2, hitTolerancePx: number = 6): string | null {
    if (!this.doc) return null;
    return findWallAtScreen(screenPos, this.transform, this.doc, {
      hitTolerancePx,
      activeLevelId: this.activeLevelId,
    });
  }

  // ---------------------------------------------------------------------------
  // Gestionnaires d'Événements DOM
  // ---------------------------------------------------------------------------

  private attachEventListeners(): void {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const screenPos = vec2(e.clientX - rect.left, e.clientY - rect.top);

      // Facteur de zoom logarithmique doux
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.transform.zoomAt(screenPos, factor);
      this.render();
    };

    const onPointerDown = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenPos = vec2(e.clientX - rect.left, e.clientY - rect.top);

      this.pointerDownPos = screenPos;
      this.lastPointerPos = screenPos;

      // Clic molette (bouton 1) ou clic droit (bouton 2) ou clic gauche + Espace/Alt -> Début de pan
      if (e.button === 1 || e.button === 2 || (e.button === 0 && (e.altKey || e.shiftKey))) {
        this.isPanning = true;
        this.canvas.setPointerCapture?.(e.pointerId);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenPos = vec2(e.clientX - rect.left, e.clientY - rect.top);

      if (this.isPanning) {
        const delta = vec2(
          screenPos.x - this.lastPointerPos.x,
          screenPos.y - this.lastPointerPos.y,
        );
        this.transform.panByScreen(delta);
        this.lastPointerPos = screenPos;
        this.render();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenPos = vec2(e.clientX - rect.left, e.clientY - rect.top);

      if (this.isPanning) {
        this.isPanning = false;
        try {
          this.canvas.releasePointerCapture?.(e.pointerId);
        } catch {
          // Ignorer si la capture était déjà relâchée
        }
      }

      // Traitement du clic gauche sans déplacement (sélection interne si activée)
      if (this.enableInternalSelection && e.button === 0 && !e.altKey && !e.shiftKey) {
        const dragDist = distance(this.pointerDownPos, screenPos);
        if (dragDist < 5) {
          const hitId = this.hitTest(screenPos);
          if (hitId) {
            this.setSelectedIds([hitId]);
          } else {
            this.setSelectedIds([]);
          }
        }
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      // Évite l'ouverture intempestive du menu contextuel lors du pan au clic droit
      e.preventDefault();
    };

    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', onPointerDown);
    this.canvas.addEventListener('pointermove', onPointerMove);
    this.canvas.addEventListener('pointerup', onPointerUp);
    this.canvas.addEventListener('contextmenu', onContextMenu);

    this.cleanupFns.push(() => {
      this.canvas.removeEventListener('wheel', onWheel);
      this.canvas.removeEventListener('pointerdown', onPointerDown);
      this.canvas.removeEventListener('pointermove', onPointerMove);
      this.canvas.removeEventListener('pointerup', onPointerUp);
      this.canvas.removeEventListener('contextmenu', onContextMenu);
    });
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === this.canvas) {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) {
              this.resize(width, height);
            }
          }
        }
      });
      this.resizeObserver.observe(this.canvas);

      this.cleanupFns.push(() => {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
      });
    }
  }

  private createEmptyPlaceholderDoc(): DocumentFor2D {
    // Petit document factice interne utilisé uniquement si aucun doc n'a été fourni
    return {
      getState: () => ({
        walls: {},
        wallTypes: {},
        doors: {},
        windows: {},
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Nettoyage et Libération des Ressources
  // ---------------------------------------------------------------------------

  public dispose(): void {
    for (const cleanup of this.cleanupFns) {
      try {
        cleanup();
      } catch (err) {
        console.error('Erreur lors du nettoyage d’écouteur View2D:', err);
      }
    }
    this.cleanupFns.length = 0;
    this.commandListeners.clear();
    this.selectionListeners.clear();
    this.selectedIds.clear();
    this.doc = null;
  }
}
