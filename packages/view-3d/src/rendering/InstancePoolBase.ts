/**
 * InstancePoolBase — Socle générique de gestionnaire de pools GPU THREE.InstancedMesh
 *
 * Factorise intégralement l'instanciation GPU partagée (batching, raycast picking par instanceId,
 * surbrillance de sélection, clipping planes, libération déterministe) entre MEP et Architecture.
 */

import * as THREE from 'three';
import type { RawMeshData } from '@tabax/geometry';
import { MeshAdapter } from '../MeshAdapter.js';

export interface InstanceAnchorLike<TProto extends string, TRole extends string> {
  readonly prototypeKey: TProto;
  readonly matrix: readonly number[];
  readonly materialRole: TRole;
  readonly color?: string | undefined;
}

export interface InstancePoolConfig<TProto extends string, TRole extends string> {
  readonly scene: THREE.Scene;
  readonly poolPrefix: string;
  readonly getPrototypeMesh: (key: TProto) => RawMeshData;
  readonly getMaterial: (role: TRole, color?: string) => THREE.Material;
  readonly applyMaterialClippingPlanes: (planes: THREE.Plane[]) => void;
}

interface PoolEntry {
  readonly elementId: string;
  readonly matrix: THREE.Matrix4;
}

interface PoolRecord<TProto extends string, TRole extends string> {
  readonly key: string;
  readonly prototypeKey: TProto;
  readonly materialRole: TRole;
  readonly color?: string | undefined;
  readonly entries: PoolEntry[];
  instancedMesh: THREE.InstancedMesh | null;
}

const HIGHLIGHT_COLOR = new THREE.Color(0x3b82f6);
const NEUTRAL_COLOR = new THREE.Color(0xffffff);

export class GenericInstancePoolManager<TProto extends string, TRole extends string> {
  protected readonly scene: THREE.Scene;
  private readonly config: InstancePoolConfig<TProto, TRole>;
  private readonly prototypeGeometries = new Map<TProto, THREE.BufferGeometry>();
  private readonly pools = new Map<string, PoolRecord<TProto, TRole>>();
  private readonly elementPoolKeys = new Map<string, Set<string>>();
  private readonly highlightedIds = new Set<string>();
  private clippingPlanes: THREE.Plane[] = [];
  private batchDepth = 0;
  private readonly pendingRebuildKeys = new Set<string>();

  public constructor(config: InstancePoolConfig<TProto, TRole>) {
    this.scene = config.scene;
    this.config = config;
  }

  public beginBatch(): void {
    this.batchDepth++;
  }

  public endBatch(): void {
    if (this.batchDepth === 0) return;
    this.batchDepth--;
    if (this.batchDepth === 0 && this.pendingRebuildKeys.size > 0) {
      for (const key of this.pendingRebuildKeys) {
        this.rebuildPool(key);
      }
      this.pendingRebuildKeys.clear();
    }
  }

  private schedulePoolRebuild(key: string): void {
    if (this.batchDepth > 0) {
      this.pendingRebuildKeys.add(key);
      return;
    }
    this.rebuildPool(key);
  }

  private getOrCreatePrototypeGeometry(key: TProto): THREE.BufferGeometry {
    const existing = this.prototypeGeometries.get(key);
    if (existing) return existing;
    const geom = MeshAdapter.fromRawMeshData(this.config.getPrototypeMesh(key));
    this.prototypeGeometries.set(key, geom);
    return geom;
  }

  private buildPoolKey(prototypeKey: TProto, materialRole: TRole, color?: string): string {
    return `${prototypeKey}::${materialRole}::${color ?? 'default'}`;
  }

  public registerElementInstances(
    elementId: string,
    anchors: readonly InstanceAnchorLike<TProto, TRole>[],
  ): void {
    this.removeElementInstances(elementId);
    if (anchors.length === 0) return;

    const dirtyPoolKeys = new Set<string>();
    const ownedKeys = new Set<string>();

    for (const anchor of anchors) {
      const key = this.buildPoolKey(anchor.prototypeKey, anchor.materialRole, anchor.color);
      let pool = this.pools.get(key);
      if (!pool) {
        pool = {
          key,
          prototypeKey: anchor.prototypeKey,
          materialRole: anchor.materialRole,
          color: anchor.color,
          entries: [],
          instancedMesh: null,
        };
        this.pools.set(key, pool);
      }

      const matrix = new THREE.Matrix4().fromArray(anchor.matrix);
      pool.entries.push({ elementId, matrix });
      dirtyPoolKeys.add(key);
      ownedKeys.add(key);
    }

    this.elementPoolKeys.set(elementId, ownedKeys);
    for (const key of dirtyPoolKeys) {
      this.schedulePoolRebuild(key);
    }
  }

  public removeElementInstances(elementId: string): void {
    const keys = this.elementPoolKeys.get(elementId);
    if (!keys || keys.size === 0) return;

    for (const key of keys) {
      const pool = this.pools.get(key);
      if (!pool) continue;
      for (let i = pool.entries.length - 1; i >= 0; i--) {
        if (pool.entries[i]?.elementId === elementId) {
          pool.entries.splice(i, 1);
        }
      }
      this.schedulePoolRebuild(key);
    }

    this.elementPoolKeys.delete(elementId);
  }

  private rebuildPool(key: string): void {
    const pool = this.pools.get(key);
    if (!pool) return;

    if (pool.instancedMesh) {
      this.scene.remove(pool.instancedMesh);
      pool.instancedMesh.dispose();
      pool.instancedMesh = null;
    }

    if (pool.entries.length === 0) {
      this.pools.delete(key);
      return;
    }

    const geometry = this.getOrCreatePrototypeGeometry(pool.prototypeKey);
    const material = this.config.getMaterial(pool.materialRole, pool.color);
    if (this.clippingPlanes.length > 0) {
      material.clippingPlanes = this.clippingPlanes;
      material.clipShadows = true;
    }

    const mesh = new THREE.InstancedMesh(geometry, material, pool.entries.length);
    mesh.name = `${this.config.poolPrefix}-${pool.key}`;
    mesh.userData = {
      isInstancedPool: true,
      poolKey: pool.key,
      isSharedMaterial: true,
    };

    for (let i = 0; i < pool.entries.length; i++) {
      const entry = pool.entries[i];
      if (!entry) continue;
      mesh.setMatrixAt(i, entry.matrix);
      mesh.setColorAt(
        i,
        this.highlightedIds.has(entry.elementId) ? HIGHLIGHT_COLOR : NEUTRAL_COLOR,
      );
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();

    pool.instancedMesh = mesh;
    this.scene.add(mesh);
  }

  public setHighlight(ids: Iterable<string>): void {
    this.highlightedIds.clear();
    for (const id of ids) {
      this.highlightedIds.add(id);
    }

    for (const pool of this.pools.values()) {
      const mesh = pool.instancedMesh;
      if (!mesh) continue;
      let changed = false;
      for (let i = 0; i < pool.entries.length; i++) {
        const entry = pool.entries[i];
        if (!entry) continue;
        mesh.setColorAt(
          i,
          this.highlightedIds.has(entry.elementId) ? HIGHLIGHT_COLOR : NEUTRAL_COLOR,
        );
        changed = true;
      }
      if (changed && mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  public applyClippingPlanes(planes: THREE.Plane[]): void {
    this.clippingPlanes = planes;
    this.config.applyMaterialClippingPlanes(planes);
  }

  public getAllInstancedMeshes(): THREE.InstancedMesh[] {
    const meshes: THREE.InstancedMesh[] = [];
    for (const pool of this.pools.values()) {
      if (pool.instancedMesh) {
        meshes.push(pool.instancedMesh);
      }
    }
    return meshes;
  }

  public raycast(
    raycaster: THREE.Raycaster,
    activeClippingPlane?: THREE.Plane | null,
  ): { readonly distance: number; readonly elementId: string } | null {
    const meshes = this.getAllInstancedMeshes();
    if (meshes.length === 0) return null;

    const hits = raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      if (activeClippingPlane && activeClippingPlane.distanceToPoint(hit.point) < 0) {
        continue;
      }
      if (hit.instanceId === undefined) continue;
      const poolKey = hit.object.userData?.poolKey as string | undefined;
      if (!poolKey) continue;
      const pool = this.pools.get(poolKey);
      const entry = pool?.entries[hit.instanceId];
      if (entry) {
        return { distance: hit.distance, elementId: entry.elementId };
      }
    }
    return null;
  }

  public getPoolCount(): number {
    return this.pools.size;
  }

  public getTotalInstanceCount(): number {
    let total = 0;
    for (const pool of this.pools.values()) {
      total += pool.entries.length;
    }
    return total;
  }

  public dispose(): void {
    for (const pool of this.pools.values()) {
      if (pool.instancedMesh) {
        this.scene.remove(pool.instancedMesh);
        pool.instancedMesh.dispose();
        pool.instancedMesh = null;
      }
    }
    this.pools.clear();
    this.elementPoolKeys.clear();
    this.highlightedIds.clear();

    for (const geom of this.prototypeGeometries.values()) {
      geom.dispose();
    }
    this.prototypeGeometries.clear();
  }
}
