import {
  HOUSEKEEPING_SERVICE,
  VETERINARY_SERVICE,
} from "@/lib/provider-services";

export type ServiceMenuEditorCopy = {
  title: string;
  hint: string;
  templateBtn: string;
  namePh: string;
  disclaimer: string;
  addRow: string;
  empty: string;
};

const BASE = {
  es: {
    title: "Menú de servicios (precios fijos)",
    menuHint: "Lista los arreglos comunes con su precio. Los compradores los verán publicados y podrás armar un presupuesto desde el chat.",
    menuHintVet: "Lista consultas, vacunas y servicios comunes con precio fijo. Los clientes los verán publicados y podrás armar un presupuesto desde el chat.",
    menuHintHousekeeping: "Lista limpieza estándar/profunda por cuarto, lavado de ropa y extras con precio por visita. En el chat multiplicas por frecuencia (diario, semanal, 2×/semana, mensual).",
    menuTemplateBtn: "Cargar plantilla sugerida (20 servicios)",
    menuTemplateBtnVet: "Cargar plantilla sugerida (35 servicios)",
    menuTemplateBtnHousekeeping: "Cargar plantilla sugerida (32 servicios)",
    menuAddRow: "+ Agregar servicio",
    menuRowNamePh: "Nombre (ej. Dobladillo de pantalón)",
    menuRowNamePhVet: "Nombre (ej. Consulta general perro/gato)",
    menuRowNamePhHousekeeping: "Nombre (ej. Baño profundo)",
    menuDisclaimer: "El precio puede ajustarse al revisar la prenda físicamente.",
    menuDisclaimerVet: "El precio puede ajustarse después del examen físico y según el peso, edad o condición del paciente.",
    menuDisclaimerHousekeeping: "El precio puede variar según el estado del hogar, el tamaño real y el acceso. Se confirma en visita o por mensaje.",
    menuEmpty: "Sin servicios — toca «Cargar plantilla» o «+ Agregar servicio» para empezar.",
  },
  en: {
    title: "Service menu (fixed prices)",
    menuHint: "List common alterations with their price. Buyers will see the published menu and you can build a quote from chat.",
    menuHintVet: "List exams, vaccines, and common services at fixed prices. Clients will see the published menu and you can build a quote from chat.",
    menuHintHousekeeping: "List standard/deep cleaning by room, laundry, and add-ons at per-visit prices. In chat, multiply by frequency (daily, weekly, twice/week, monthly).",
    menuTemplateBtn: "Load suggested template (20 services)",
    menuTemplateBtnVet: "Load suggested template (35 services)",
    menuTemplateBtnHousekeeping: "Load suggested template (32 services)",
    menuAddRow: "+ Add service",
    menuRowNamePh: "Name (e.g. Pants hem)",
    menuRowNamePhVet: "Name (e.g. General exam dog/cat)",
    menuRowNamePhHousekeeping: "Name (e.g. Deep bathroom clean)",
    menuDisclaimer: "Price may change after physical inspection of the garment.",
    menuDisclaimerVet: "Price may change after physical exam and depending on the patient's weight, age, or condition.",
    menuDisclaimerHousekeeping: "Price may vary based on home condition, actual size, and access. Confirmed on visit or by message.",
    menuEmpty: "No services yet — tap 'Load template' or '+ Add service' to begin.",
  },
} as const;

export function getServiceMenuEditorCopy(
  lang: "es" | "en",
  providerSlug: string,
): ServiceMenuEditorCopy {
  const t = BASE[lang];
  if (providerSlug === VETERINARY_SERVICE) {
    return {
      title: t.title,
      hint: t.menuHintVet,
      templateBtn: t.menuTemplateBtnVet,
      namePh: t.menuRowNamePhVet,
      disclaimer: t.menuDisclaimerVet,
      addRow: t.menuAddRow,
      empty: t.menuEmpty,
    };
  }
  if (providerSlug === HOUSEKEEPING_SERVICE) {
    return {
      title: t.title,
      hint: t.menuHintHousekeeping,
      templateBtn: t.menuTemplateBtnHousekeeping,
      namePh: t.menuRowNamePhHousekeeping,
      disclaimer: t.menuDisclaimerHousekeeping,
      addRow: t.menuAddRow,
      empty: t.menuEmpty,
    };
  }
  return {
    title: t.title,
    hint: t.menuHint,
    templateBtn: t.menuTemplateBtn,
    namePh: t.menuRowNamePh,
    disclaimer: t.menuDisclaimer,
    addRow: t.menuAddRow,
    empty: t.menuEmpty,
  };
}
