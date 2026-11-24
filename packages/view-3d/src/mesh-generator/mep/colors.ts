/**
 * mesh-generator/mep/colors — Nuancier normalisé MEP et utilitaires de couleur
 */

export const MEP_SYSTEM_COLORS: Record<string, string> = {
  // Plomberie sanitaire
  domestic_cold_water: '#2563eb', // Bleu cobalt (EF)
  domestic_hot_water: '#dc2626', // Rouge vif (ECS)
  drainage_waste: '#78716c', // Gris chaud (EU)
  drainage_soil: '#44403c', // Brun sombre (EV)
  // Génie climatique / Ventilation
  supply_air: '#0284c7', // Cyan azur
  return_air: '#ea580c', // Orange vif
  exhaust_air: '#65a30d', // Vert chartreuse
  // Chauffage / Hydronique
  hydronic_supply: '#0891b2', // Turquoise soutenu
  hydronic_return: '#be185d', // Rose carmin
  // Électricité / Courants faibles
  power: '#f59e0b', // Ambre soutenu
  telecom: '#8b5cf6', // Violet
};

export const MEP_DOMAIN_FALLBACK_COLORS: Record<string, string> = {
  plumbing: '#2563eb',
  hvac: '#0284c7',
  hydronic: '#0891b2',
  electrical: '#f59e0b',
};

export const DEFAULT_MEP_COLOR = '#64748b';

export function getMepSystemColor(systemType?: string, domain?: string): string {
  const sysColor = systemType ? MEP_SYSTEM_COLORS[systemType] : undefined;
  if (sysColor) return sysColor;
  const domColor = domain ? MEP_DOMAIN_FALLBACK_COLORS[domain] : undefined;
  if (domColor) return domColor;
  return DEFAULT_MEP_COLOR;
}
