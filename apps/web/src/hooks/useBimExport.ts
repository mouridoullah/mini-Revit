import { useCallback } from 'react';
import { BimDocument, exportToIfc, detectRooms } from '@tabax/core';
import { generatePlanSvg, generatePlanDxf, generatePdfBook, type PdfBookOptions } from '@tabax/view-2d';
import { exportToFile, importFromFile } from '../persistence/jsonIO.js';
import type { ToolKind } from '../tools/types.js';

export interface UseBimExportOptions {
  readonly doc: BimDocument;
  readonly activeLevelId: string;
  readonly resetActiveTool: () => void;
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly setDrawingLength: (len: number | null) => void;
  readonly setDocument: (newDoc: BimDocument) => void;
  readonly setActiveLevelId: (levelId: string) => void;
  readonly setActiveToolKind: (kind: ToolKind) => void;
  readonly setErrorMessage: (msg: string | null) => void;
  readonly setInfoMessage: (msg: string | null) => void;
}

export interface UseBimExportResult {
  readonly handleSave: () => void;
  readonly handleExportIfc: () => void;
  readonly handleExportSvg: (scale: 50 | 100 | 200) => void;
  readonly handleExportPlanDxf: () => void;
  readonly handleExportPdfBook: (options?: PdfBookOptions) => void;
  readonly handleLoadFile: (file: File) => Promise<void>;
  readonly handleLoadR4Demo: () => Promise<void>;
}

/**
 * Hook centralisant les fonctionnalités d'export et d'import BIM :
 * - Sauvegarde / Restauration de fichiers JSON natifs
 * - Export standard IFC4 ISO 16739
 * - Export cartographique et vectoriel SVG normalisé
 * - Chargement de la maquette de démonstration Immeuble R+4
 */
export function useBimExport({
  doc,
  activeLevelId,
  resetActiveTool,
  setSelectedIds,
  setDrawingLength,
  setDocument,
  setActiveLevelId,
  setActiveToolKind,
  setErrorMessage,
  setInfoMessage,
}: UseBimExportOptions): UseBimExportResult {
  const handleSave = useCallback(() => {
    exportToFile(doc, 'project.mbim.json');
  }, [doc]);

  const handleExportIfc = useCallback(() => {
    try {
      const ifcContent = exportToIfc(doc.getState(), {
        projectName: 'Projet Tabax',
        filename: 'tabax-model.ifc',
        author: 'Tabax Architect',
      });
      const blob = new Blob([ifcContent], { type: 'model/ifc;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tabax-model.ifc';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur lors de l’exportation IFC4.');
    }
  }, [doc, setErrorMessage]);

  const handleExportSvg = useCallback(
    (scale: 50 | 100 | 200) => {
      try {
        const docState = doc.getState();
        const targetLevelId =
          activeLevelId && docState.levels[activeLevelId]
            ? activeLevelId
            : (Object.keys(docState.levels)[0] ?? '');
        const levelName = targetLevelId ? docState.levels[targetLevelId]?.name : 'Étage';
        const detected = targetLevelId ? detectRooms(docState, targetLevelId) : [];
        const roomsForSvg = detected.map((d) => ({
          polygon: d.polygon,
          areaMm2: d.areaMm2,
          seed: d.seed,
          name: (d.existingRoomId && docState.rooms[d.existingRoomId]?.name) || 'Pièce',
        }));

        const svgContent = generatePlanSvg(doc, {
          scale,
          title: `Plan d’Étage - ${levelName}`,
          project: 'Projet Tabax',
          author: 'Tabax Architect',
          levelId: targetLevelId,
          rooms: roomsForSvg,
        });

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plan-etage-1-${scale}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setInfoMessage('Plan SVG exporté.');
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Erreur lors de l’exportation du plan SVG.',
        );
      }
    },
    [doc, activeLevelId, setErrorMessage, setInfoMessage],
  );

  const handleExportPlanDxf = useCallback(() => {
    try {
      const docState = doc.getState();
      const targetLevelId =
        activeLevelId && docState.levels[activeLevelId]
          ? activeLevelId
          : (Object.keys(docState.levels)[0] ?? '');
      const levelName = targetLevelId ? (docState.levels[targetLevelId]?.name ?? 'Étage') : 'Étage';
      const detected = targetLevelId ? detectRooms(docState, targetLevelId) : [];
      const roomsForDxf = detected.map((d) => ({
        id: d.existingRoomId ?? `room_${d.seed.x}_${d.seed.y}`,
        polygon: d.polygon,
        areaMm2: d.areaMm2,
        seed: d.seed,
        name: (d.existingRoomId && docState.rooms[d.existingRoomId]?.name) || 'Pièce',
      }));

      const dxfContent = generatePlanDxf(doc, {
        levelId: targetLevelId,
        rooms: roomsForDxf,
        includeHatches: true,
        includeMep: true,
      });

      const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plan-${levelName.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setInfoMessage('Plan DXF (R12) exporté.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erreur lors de l’exportation du plan DXF.',
      );
    }
  }, [doc, activeLevelId, setErrorMessage, setInfoMessage]);

  const handleExportPdfBook = useCallback(
    (options: PdfBookOptions = {}) => {
      try {
        const pdfBytes = generatePdfBook(doc, options);
        // Créer un blob binaire application/pdf
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const projectSlug = (options.projectTitle ?? 'carnet-de-plans')
          .toLowerCase()
          .replace(/[^a-z0-9_-]/gi, '_');
        a.download = `${projectSlug}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setInfoMessage('Carnet de plans PDF généré et téléchargé.');
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Erreur lors de la génération du carnet de plans PDF.',
        );
      }
    },
    [doc, setErrorMessage, setInfoMessage],
  );

  const handleLoadFile = useCallback(
    async (file: File) => {
      try {
        resetActiveTool();
        setSelectedIds([]);
        setDrawingLength(null);
        const newDoc = await importFromFile(file);
        setDocument(newDoc);
        setActiveLevelId(Object.keys(newDoc.getState().levels)[0] ?? '');
        setActiveToolKind('select');
        setErrorMessage(null);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Erreur lors du chargement du fichier JSON architectural.',
        );
      }
    },
    [
      resetActiveTool,
      setSelectedIds,
      setDrawingLength,
      setDocument,
      setActiveLevelId,
      setActiveToolKind,
      setErrorMessage,
    ],
  );

  const handleLoadR4Demo = useCallback(async () => {
    try {
      resetActiveTool();
      setSelectedIds([]);
      setDrawingLength(null);
      const resp = await fetch(`${import.meta.env.BASE_URL}demo-immeuble-r4.json`);
      if (!resp.ok) {
        throw new Error(`Échec du téléchargement (/demo-immeuble-r4.json: ${resp.status})`);
      }
      const text = await resp.text();
      const r4Doc = BimDocument.fromJSON(text);
      setDocument(r4Doc);
      setActiveLevelId('level_r0');
      setInfoMessage('Immeuble R+4 complet chargé avec succès !');
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erreur lors du chargement de la démo R+4.',
      );
    }
  }, [
    resetActiveTool,
    setSelectedIds,
    setDrawingLength,
    setDocument,
    setActiveLevelId,
    setInfoMessage,
    setErrorMessage,
  ]);

  return {
    handleSave,
    handleExportIfc,
    handleExportSvg,
    handleExportPlanDxf,
    handleExportPdfBook,
    handleLoadFile,
    handleLoadR4Demo,
  };
}
