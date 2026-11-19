/**
 * @mini-bim/web/tools/MepTool
 *
 * Outil interactif de dessin et modélisation MEP (Sous-phase 9.3.2).
 * Machine à états pure : Idle -> AwaitingStart -> Drawing -> Committed.
 * Snapping magnétique des ports régie par l'ADR-047 (pixels écran).
 */

import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type MepToolState,
  type MepToolConfig,
  type SnappedPortTarget,
} from './types.js';
import {
  type Vec2,
  type PreviewShape,
} from '@mini-bim/view-2d';

const vec2 = (x: number, y: number): Vec2 => ({ x, y });
import {
  createPipe,
  createDuct,
  createCableTray,
  AddPipeCommand,
  AddDuctCommand,
  AddCableTrayCommand,
  ConnectPortsCommand,
  generateId,
  type Command,
  type BimState,
  type ElementId,
  type PlumbingSystemType,
  type HvacSystemType,
  type ElectricalSystemType,
  type HydronicSystemType,
} from '@mini-bim/core';
import { evaluateMepPortSnap } from './mepSnap.js';
import { snapAngle45 } from './snap.js';

export const DEFAULT_MEP_CONFIG: MepToolConfig = Object.freeze({
  category: 'pipe',
  shape: 'round',
  domain: 'plumbing',
  systemType: 'domestic_cold_water',
  diameter: 50,
  elevationOffsetMm: 2500, // 2,50 m sous plafond par défaut
  displayMode: 'single-line',
});

/**
 * Commande transactionnelle composite pour créer un segment MEP et raccorder ses ports incidents.
 */
export class CreateMepSegmentCommand implements Command {
  public readonly name = 'CreateMepSegment';
  private changedIds: ElementId[] = [];

  public constructor(
    public readonly createCommand: AddPipeCommand | AddDuctCommand | AddCableTrayCommand,
    public readonly connectCommands: ConnectPortsCommand[],
  ) {}

  public apply(draft: BimState): void {
    this.createCommand.apply(draft);
    this.changedIds = [...this.createCommand.getChangedIds()];

    for (const connCmd of this.connectCommands) {
      try {
        connCmd.apply(draft);
        this.changedIds.push(...connCmd.getChangedIds());
      } catch {
        // Si la connexion échoue (ex: tolérance géométrique), le segment est conservé
      }
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds;
  }
}

export class MepTool implements Tool {
  public readonly kind = 'mep' as const;
  private state: MepToolState = { kind: 'idle' };
  private activeConfig: MepToolConfig = DEFAULT_MEP_CONFIG;

  public setConfig(config: Partial<MepToolConfig>): void {
    this.activeConfig = {
      ...this.activeConfig,
      ...config,
    };
  }

  public getConfig(): MepToolConfig {
    return this.activeConfig;
  }

  public getState(): MepToolState {
    return this.state;
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    const config = ctx.mepConfig ?? this.activeConfig;

    // 1. Annulation via la touche Escape ou réinitialisation
    if (event.type === 'keydown' && event.key === 'Escape') {
      this.reset();
      return { kind: 'preview', preview: null };
    }

    // 2. Machine à états
    switch (this.state.kind) {
      case 'idle': {
        if (event.type === 'pointermove') {
          const snapped = evaluateMepPortSnap({
            screenPos: event.screen,
            transform: ctx.transform,
            doc: ctx.doc,
            config,
            activeLevelId: ctx.activeLevelId,
          });

          this.state = {
            kind: 'awaiting-start',
            config,
            snappedPort: snapped,
          };

          if (snapped) {
            return {
              kind: 'preview',
              preview: this.createPortHoverPreview(snapped, ctx),
            };
          }
          return { kind: 'preview', preview: null };
        } else if (event.type === 'pointerdown' && event.button === 0) {
          const snapped = evaluateMepPortSnap({
            screenPos: event.screen,
            transform: ctx.transform,
            doc: ctx.doc,
            config,
            activeLevelId: ctx.activeLevelId,
          });

          const startWorld = snapped
            ? vec2(snapped.port.position.x, snapped.port.position.y)
            : ctx.transform.screenToWorld(event.screen);

          this.state = {
            kind: 'drawing',
            config,
            startWorld,
            currentWorld: startWorld,
            startPort: snapped?.compatible ? snapped : null,
            snappedEndPort: null,
          };

          return {
            kind: 'preview',
            preview: this.createMepPreview(startWorld, startWorld, config, null),
          };
        }
        return { kind: 'noop' };
      }

      case 'awaiting-start': {
        if (event.type === 'pointermove') {
          const snapped = evaluateMepPortSnap({
            screenPos: event.screen,
            transform: ctx.transform,
            doc: ctx.doc,
            config,
            activeLevelId: ctx.activeLevelId,
          });

          this.state = {
            kind: 'awaiting-start',
            config,
            snappedPort: snapped,
          };

          if (snapped) {
            return {
              kind: 'preview',
              preview: this.createPortHoverPreview(snapped, ctx),
            };
          }
          return { kind: 'preview', preview: null };
        }

        if (event.type === 'pointerdown') {
          if (event.button !== 0) {
            this.reset();
            return { kind: 'preview', preview: null };
          }

          const snapped = evaluateMepPortSnap({
            screenPos: event.screen,
            transform: ctx.transform,
            doc: ctx.doc,
            config,
            activeLevelId: ctx.activeLevelId,
          });

          const startWorld = snapped
            ? vec2(snapped.port.position.x, snapped.port.position.y)
            : ctx.transform.screenToWorld(event.screen);

          this.state = {
            kind: 'drawing',
            config,
            startWorld,
            currentWorld: startWorld,
            startPort: snapped?.compatible ? snapped : null,
            snappedEndPort: null,
          };

          return {
            kind: 'preview',
            preview: this.createMepPreview(startWorld, startWorld, config, null),
          };
        }
        return { kind: 'noop' };
      }

      case 'drawing': {
        const { startWorld, startPort } = this.state;

        if (event.type === 'pointermove') {
          let currentWorld = ctx.transform.screenToWorld(event.screen);

          // Snapping angulaire à 45° si la touche Shift est enfoncée
          if (event.shift) {
            currentWorld = snapAngle45(startWorld, currentWorld);
          }

          // Détection d'un port d'arrivée potentiel (ADR-047)
          const snappedEnd = evaluateMepPortSnap({
            screenPos: event.screen,
            transform: ctx.transform,
            doc: ctx.doc,
            config,
            activeLevelId: ctx.activeLevelId,
            currentStartWorld: startWorld,
          });

          // Si le port cible est le même que le port de départ, on l'ignore
          const effectiveSnappedEnd =
            snappedEnd && startPort && snappedEnd.port.id === startPort.port.id
              ? null
              : snappedEnd;

          if (effectiveSnappedEnd?.compatible) {
            currentWorld = vec2(effectiveSnappedEnd.port.position.x, effectiveSnappedEnd.port.position.y);
          }

          this.state = {
            ...this.state,
            currentWorld,
            snappedEndPort: effectiveSnappedEnd,
          };

          return {
            kind: 'preview',
            preview: this.createMepPreview(startWorld, currentWorld, config, effectiveSnappedEnd),
          };
        }

        if (event.type === 'pointerdown') {
          if (event.button !== 0) {
            // Clic droit annule le tracé
            this.reset();
            return { kind: 'preview', preview: null };
          }

          let finalWorld = ctx.transform.screenToWorld(event.screen);
          if (event.shift) {
            finalWorld = snapAngle45(startWorld, finalWorld);
          }

          const snappedEnd = evaluateMepPortSnap({
            screenPos: event.screen,
            transform: ctx.transform,
            doc: ctx.doc,
            config,
            activeLevelId: ctx.activeLevelId,
            currentStartWorld: startWorld,
          });

          const effectiveSnappedEnd =
            snappedEnd && startPort && snappedEnd.port.id === startPort.port.id
              ? null
              : snappedEnd;

          if (effectiveSnappedEnd?.compatible) {
            finalWorld = vec2(effectiveSnappedEnd.port.position.x, effectiveSnappedEnd.port.position.y);
          }

          const length = Math.hypot(finalWorld.x - startWorld.x, finalWorld.y - startWorld.y);
          if (length < 50) {
            // Distance trop courte pour constituer un segment physique valide
            this.reset();
            return { kind: 'preview', preview: null };
          }

          // Création transactionnelle du segment et raccordement éventuel
          const command = this.buildCreationCommand(startWorld, finalWorld, ctx, startPort, effectiveSnappedEnd);

          this.state = {
            kind: 'awaiting-start',
            config,
            snappedPort: null,
          };

          return {
            kind: 'command',
            command,
          };
        }
        return { kind: 'noop' };
      }

      case 'committed': {
        this.state = { kind: 'idle' };
        return { kind: 'noop' };
      }
    }
  }

  public reset(): void {
    this.state = { kind: 'idle' };
  }

  private createMepPreview(
    start: Vec2,
    end: Vec2,
    config: MepToolConfig,
    snappedPort: SnappedPortTarget | null,
  ): PreviewShape {
    return {
      kind: 'mep',
      start,
      end,
      category: config.category,
      shape: config.shape ?? (config.category === 'pipe' ? 'round' : 'rectangular'),
      diameter: config.diameter ?? 50,
      width: config.width ?? 300,
      height: config.height ?? 200,
      color: this.getPreviewColor(config),
      mode: config.displayMode ?? 'single-line',
      snappedPort: snappedPort
        ? {
            pos: vec2(snappedPort.port.position.x, snappedPort.port.position.y),
            compatible: snappedPort.compatible,
          }
        : null,
    };
  }

  private createPortHoverPreview(snapped: SnappedPortTarget, ctx: ToolContext): PreviewShape {
    const pos = vec2(snapped.port.position.x, snapped.port.position.y);
    return {
      kind: 'mep',
      start: pos,
      end: pos,
      category: ctx.mepConfig?.category ?? this.activeConfig.category,
      snappedPort: {
        pos,
        compatible: snapped.compatible,
      },
    };
  }

  private getPreviewColor(config: MepToolConfig): string {
    switch (config.systemType) {
      case 'domestic_cold_water':
        return '#2563eb'; // Bleu cobalt EF
      case 'domestic_hot_water':
        return '#dc2626'; // Rouge vif ECS
      case 'supply_air':
        return '#0284c7'; // Cyan
      case 'return_air':
        return '#ea580c'; // Orange
      case 'power':
        return '#f59e0b'; // Ambre
      default:
        return '#64748b';
    }
  }

  private buildCreationCommand(
    start: Vec2,
    end: Vec2,
    ctx: ToolContext,
    startSnap: SnappedPortTarget | null | undefined,
    endSnap: SnappedPortTarget | null | undefined,
  ): Command {
    const config = ctx.mepConfig ?? this.activeConfig;
    const level = ctx.doc.getState().levels[ctx.activeLevelId];
    const baseZ = (level ? level.elevation : 0) + (config.elevationOffsetMm ?? 2500);

    const startZ = startSnap?.compatible ? startSnap.port.position.z : baseZ;
    const endZ = endSnap?.compatible ? endSnap.port.position.z : baseZ;

    const startPoint = { x: start.x, y: start.y, z: startZ };
    const endPoint = { x: end.x, y: end.y, z: endZ };

    const connectCommands: ConnectPortsCommand[] = [];

    switch (config.category) {
      case 'pipe': {
        const pipe = createPipe({
          levelId: ctx.activeLevelId,
          start: startPoint,
          end: endPoint,
          diameter: config.diameter ?? 50,
          systemId: config.systemId,
          systemType: (config.systemType as PlumbingSystemType | HydronicSystemType) ?? 'domestic_cold_water',
          domain: (config.domain as 'plumbing' | 'hydronic') ?? 'plumbing',
        });

        if (startSnap?.compatible) {
          const portStart = pipe.ports[0];
          if (portStart) {
            connectCommands.push(
              new ConnectPortsCommand({
                id: generateId(),
                category: 'mepConnector',
                portAId: startSnap.port.id,
                portBId: portStart.id,
              }),
            );
          }
        }

        if (endSnap?.compatible) {
          const portEnd = pipe.ports[1];
          if (portEnd) {
            connectCommands.push(
              new ConnectPortsCommand({
                id: generateId(),
                category: 'mepConnector',
                portAId: portEnd.id,
                portBId: endSnap.port.id,
              }),
            );
          }
        }

        return new CreateMepSegmentCommand(new AddPipeCommand(pipe), connectCommands);
      }

      case 'duct': {
        const shape = config.shape ?? 'rectangular';
        const duct = createDuct({
          levelId: ctx.activeLevelId,
          start: startPoint,
          end: endPoint,
          shape,
          diameter: shape === 'round' ? config.diameter ?? 200 : undefined,
          width: shape === 'rectangular' ? config.width ?? 300 : undefined,
          height: shape === 'rectangular' ? config.height ?? 200 : undefined,
          systemId: config.systemId,
          systemType: (config.systemType as HvacSystemType) ?? 'supply_air',
        });

        if (startSnap?.compatible) {
          const portStart = duct.ports[0];
          if (portStart) {
            connectCommands.push(
              new ConnectPortsCommand({
                id: generateId(),
                category: 'mepConnector',
                portAId: startSnap.port.id,
                portBId: portStart.id,
              }),
            );
          }
        }

        if (endSnap?.compatible) {
          const portEnd = duct.ports[1];
          if (portEnd) {
            connectCommands.push(
              new ConnectPortsCommand({
                id: generateId(),
                category: 'mepConnector',
                portAId: portEnd.id,
                portBId: endSnap.port.id,
              }),
            );
          }
        }

        return new CreateMepSegmentCommand(new AddDuctCommand(duct), connectCommands);
      }

      case 'cableTray': {
        const cableTray = createCableTray({
          levelId: ctx.activeLevelId,
          start: startPoint,
          end: endPoint,
          width: config.width ?? 200,
          height: config.height ?? 60,
          systemId: config.systemId,
          systemType: (config.systemType as ElectricalSystemType) ?? 'power',
        });

        if (startSnap?.compatible) {
          const portStart = cableTray.ports[0];
          if (portStart) {
            connectCommands.push(
              new ConnectPortsCommand({
                id: generateId(),
                category: 'mepConnector',
                portAId: startSnap.port.id,
                portBId: portStart.id,
              }),
            );
          }
        }

        if (endSnap?.compatible) {
          const portEnd = cableTray.ports[1];
          if (portEnd) {
            connectCommands.push(
              new ConnectPortsCommand({
                id: generateId(),
                category: 'mepConnector',
                portAId: portEnd.id,
                portBId: endSnap.port.id,
              }),
            );
          }
        }

        return new CreateMepSegmentCommand(new AddCableTrayCommand(cableTray), connectCommands);
      }
    }
  }
}
