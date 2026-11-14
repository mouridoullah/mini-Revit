import { type BimDocument, type Command } from '@mini-bim/core';
import { type Vec2, vec2, distance } from '@mini-bim/geometry';
import { Transform2D } from './transform.js';
import { renderPlanView, DEFAULT_VIEW2D_RENDER_CONFIG } from './renderer.js';
import { findWallAtScreen } from './hit-test.js';
import {
  type View2DOptions,
  type View2DRenderConfig,
  type CommandCallback,
  type SelectionCallback,
  type BoundingBox2D,
  type PreviewShape,
} from './types.js';

/**
 * Visualiseur et contrôleur impératif de vue en plan 2D pour Mini-BIM.
 *
 * Principes architecturaux stricts :
 * 1. Zéro dépendance vers React, Three.js ou tout framework UI.
 * 2. Utilisation exclusive de la standard Canvas 2D API (`HTMLCanvasElement`, `CanvasRenderingContext2D`).
 * 3. Ne mute JAMAIS le `BimDocument` en direct : émet des intentions de mutation (`Command`)
 *    via le système de callback `onCommandRequested`.
 * 4. Rendu à la demande (Demand-Driven Rendering) : zéro boucle RAF continue consommant du CPU au repos.
 */
export class View2D {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly transform: Transform2D;
  private config: View2DRenderConfig;
  private doc: BimDocument | null = null;
  private selectedIds: Set<string> = new Set();
  private activeLevelId: string | null = null;
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

  public getDocument(): BimDocument | null {
    return this.doc;
  }

  public setDocument(doc: BimDocument | null): void {
    this.doc = doc;
    this.render();
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

  // ---------------------------------------------------------------------------
  // Rendu à la demande (Demand-Driven Rendering)
  // ---------------------------------------------------------------------------

  /**
   * Rafraîchit immédiatement l'affichage sur le Canvas 2D.
   */
  public render(doc?: BimDocument, selectedIds?: Iterable<string>): void {
    if (doc !== undefined) {
      this.doc = doc;
    }
    if (selectedIds !== undefined) {
      this.selectedIds = new Set(selectedIds);
    }

    if (!this.doc) {
      renderPlanView(
        this.ctx,
        this.transform,
        this.createEmptyPlaceholderDoc(),
        this.selectedIds,
        {
          ...this.config,
        },
        null,
        this.preview,
      );
      return;
    }

    renderPlanView(
      this.ctx,
      this.transform,
      this.doc,
      this.selectedIds,
      this.config,
      this.activeLevelId,
      this.preview,
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
  public emitCommand(command: Command): void {
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

  private createEmptyPlaceholderDoc(): BimDocument {
    // Petit document factice interne utilisé uniquement si aucun doc n'a été fourni
    return {
      getState: () => ({
        schemaVersion: '1.0.0',
        meta: { id: '', title: '', createdAt: 0, updatedAt: 0 },
        levels: {},
        wallTypes: {},
        walls: {},
      }),
    } as unknown as BimDocument;
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
