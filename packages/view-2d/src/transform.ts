import { type Vec2, vec2 } from '@tabax/geometry';
import { type Transform2DOptions, type BoundingBox2D } from './types.js';

/**
 * Matrice et contrôleur de transformation de coordonnées 2D.
 *
 * Gère rigoureusement la conversion bidirectionnelle entre :
 * - Le repère monde architectural (en millimètres, axe Y vers le haut / Y-up).
 * - Le repère écran du Canvas 2D (en pixels, axe Y vers le bas / Y-down).
 *
 * Toutes les transformations sont mathématiquement inversibles avec une erreur absolue < 1e-9.
 */
export class Transform2D {
  private _origin: Vec2;
  private _scale: number;
  private _minScale: number;
  private _maxScale: number;
  private _viewportWidth: number;
  private _viewportHeight: number;

  public constructor(options?: Transform2DOptions) {
    this._origin = options?.origin ? vec2(options.origin.x, options.origin.y) : vec2(0, 0);
    this._scale = options?.scale ?? 0.05;
    this._minScale = options?.minScale ?? 0.001;
    this._maxScale = options?.maxScale ?? 10.0;
    this._viewportWidth = Math.max(1, options?.viewportWidth ?? 800);
    this._viewportHeight = Math.max(1, options?.viewportHeight ?? 600);

    this.clampScale();
  }

  // ---------------------------------------------------------------------------
  // Getters / Setters
  // ---------------------------------------------------------------------------

  public get origin(): Vec2 {
    return this._origin;
  }

  public set origin(value: Vec2) {
    this._origin = vec2(value.x, value.y);
  }

  public get scale(): number {
    return this._scale;
  }

  public set scale(value: number) {
    this._scale = value;
    this.clampScale();
  }

  public get minScale(): number {
    return this._minScale;
  }

  public get maxScale(): number {
    return this._maxScale;
  }

  public get viewportWidth(): number {
    return this._viewportWidth;
  }

  public get viewportHeight(): number {
    return this._viewportHeight;
  }

  /**
   * Met à jour les dimensions du viewport en pixels (ex: lors du redimensionnement de la fenêtre).
   */
  public setViewportSize(width: number, height: number): void {
    this._viewportWidth = Math.max(1, width);
    this._viewportHeight = Math.max(1, height);
  }

  // ---------------------------------------------------------------------------
  // Conversion de Coordonnées
  // ---------------------------------------------------------------------------

  /**
   * Convertit un point du monde architectural (mm, Y-up) en coordonnées écran Canvas (px, Y-down).
   *
   * Formules :
   *   x_s = W / 2 + (x_w - origin.x) * scale
   *   y_s = H / 2 - (y_w - origin.y) * scale
   */
  public worldToScreen(worldPoint: Vec2): Vec2 {
    const cx = this._viewportWidth / 2;
    const cy = this._viewportHeight / 2;
    return vec2(
      cx + (worldPoint.x - this._origin.x) * this._scale,
      cy - (worldPoint.y - this._origin.y) * this._scale,
    );
  }

  /**
   * Convertit un point écran Canvas (px, Y-down) en coordonnées du monde architectural (mm, Y-up).
   *
   * Inversion exacte :
   *   x_w = origin.x + (x_s - W / 2) / scale
   *   y_w = origin.y - (y_s - H / 2) / scale
   */
  public screenToWorld(screenPoint: Vec2): Vec2 {
    const cx = this._viewportWidth / 2;
    const cy = this._viewportHeight / 2;
    return vec2(
      this._origin.x + (screenPoint.x - cx) / this._scale,
      this._origin.y - (screenPoint.y - cy) / this._scale,
    );
  }

  /**
   * Convertit une distance euclidienne du monde (mm) en distance écran (px).
   */
  public worldDistanceToScreen(distanceMm: number): number {
    return distanceMm * this._scale;
  }

  /**
   * Convertit une distance euclidienne écran (px) en distance monde (mm).
   */
  public screenDistanceToWorld(distancePx: number): number {
    return distancePx / this._scale;
  }

  /**
   * Retourne l'emprise rectangulaire visible dans le repère monde architectural (mm).
   */
  public getVisibleWorldBounds(): BoundingBox2D {
    const pTopLeft = this.screenToWorld(vec2(0, 0));
    const pBottomRight = this.screenToWorld(vec2(this._viewportWidth, this._viewportHeight));

    return {
      min: vec2(Math.min(pTopLeft.x, pBottomRight.x), Math.min(pTopLeft.y, pBottomRight.y)),
      max: vec2(Math.max(pTopLeft.x, pBottomRight.x), Math.max(pTopLeft.y, pBottomRight.y)),
    };
  }

  // ---------------------------------------------------------------------------
  // Manipulations de Caméra (Pan & Zoom)
  // ---------------------------------------------------------------------------

  /**
   * Déplace la vue (pan) d'un vecteur exprimé en pixels écran.
   * Un déplacement vers la droite (deltaScreen.x > 0) déplace le monde vers la droite,
   * ce qui correspond à inspecter des coordonnées monde à gauche (origin.x diminue).
   */
  public panByScreen(deltaScreen: Vec2): void {
    this._origin = vec2(
      this._origin.x - deltaScreen.x / this._scale,
      this._origin.y + deltaScreen.y / this._scale,
    );
  }

  /**
   * Réalise un zoom centré sur un point d'écran précis (ex: la position du curseur de la souris).
   * Le point du monde sous le curseur reste strictement stationnaire à l'écran après le zoom.
   *
   * @param screenPoint Position du curseur en pixels écran.
   * @param factor Facteur multiplicatif d'échelle (> 0, ex: 1.1 pour zoomer, 0.9 pour dézoomer).
   */
  public zoomAt(screenPoint: Vec2, factor: number): void {
    if (factor <= 0 || !Number.isFinite(factor)) return;

    // Point du monde sous le curseur avant changement d'échelle
    const worldPoint = this.screenToWorld(screenPoint);

    const oldScale = this._scale;
    this._scale = Math.max(this._minScale, Math.min(this._maxScale, oldScale * factor));

    if (this._scale === oldScale) return;

    // Réajustement de l'origine pour que worldPoint reste au même screenPoint
    const cx = this._viewportWidth / 2;
    const cy = this._viewportHeight / 2;

    this._origin = vec2(
      worldPoint.x - (screenPoint.x - cx) / this._scale,
      worldPoint.y + (screenPoint.y - cy) / this._scale,
    );
  }

  /**
   * Ajuste la caméra (pan + zoom) pour cadrer l'ensemble de la boîte englobante spécifiée.
   *
   * @param bounds Boîte englobante en coordonnées monde (mm).
   * @param paddingPx Marge de confort intérieure en pixels (défaut : 40 px).
   */
  public zoomToFit(bounds: BoundingBox2D, paddingPx: number = 40): void {
    const worldW = bounds.max.x - bounds.min.x;
    const worldH = bounds.max.y - bounds.min.y;

    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerY = (bounds.min.y + bounds.max.y) / 2;

    this._origin = vec2(centerX, centerY);

    // Si la boîte est quasi-ponctuelle, on applique une dimension minimale de sécurité
    const effectiveW = Math.max(worldW, 500);
    const effectiveH = Math.max(worldH, 500);

    const availW = Math.max(50, this._viewportWidth - 2 * paddingPx);
    const availH = Math.max(50, this._viewportHeight - 2 * paddingPx);

    const fitScale = Math.min(availW / effectiveW, availH / effectiveH);
    this._scale = Math.max(this._minScale, Math.min(this._maxScale, fitScale));
  }

  // ---------------------------------------------------------------------------
  // Helpers internes
  // ---------------------------------------------------------------------------

  private clampScale(): void {
    this._scale = Math.max(this._minScale, Math.min(this._maxScale, this._scale));
  }
}
