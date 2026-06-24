import {
  DOG_GROOMING_SERVICE,
  HOUSEKEEPING_SERVICE,
  PET_SITTING_SERVICE,
  PET_WALKING_SERVICE,
  TRANSPORT_APP_SERVICE,
  VETERINARY_SERVICE,
} from "@/lib/provider-services";

export type ServiceMenuEditorCopy = {
  title: string;
  hint: string;
  templateBtn: string;
  nameEsPh: string;
  nameEnPh: string;
  disclaimer: string;
  addRow: string;
  empty: string;
  colEs: string;
  colEn: string;
};

const BASE = {
  es: {
    title: "Menú de servicios (precios fijos)",
    menuHint: "Lista los arreglos comunes con su precio. Los compradores los verán publicados y podrás armar un presupuesto desde el chat.",
    menuHintVet: "Lista consultas, vacunas y servicios comunes con precio fijo. Los clientes los verán publicados y podrás armar un presupuesto desde el chat.",
    menuHintHousekeeping: "Lista limpieza estándar/profunda por cuarto, lavado de ropa y extras con precio por visita. En el chat multiplicas por frecuencia (diario, semanal, 2×/semana, mensual).",
    menuHintPetWalk: "Lista duración de paseos, perros adicionales y extras con precio por visita. Los clientes solicitan cotización desde el chat con sus datos de contacto.",
    menuHintPetSit: "Lista visitas, hospedaje y cuidado diario con precio fijo. Los clientes solicitan cotización desde el chat con dirección y horario preferido.",
    menuHintPetGroom: "Lista baños y estética por tamaño de perro con precio de referencia. El precio final se confirma al ver la mascota.",
    menuHintTransport: "Lista viajes locales, aeropuertos y servicios especiales con precio fijo por viaje. Los pasajeros eligen del menú y solicitan cotización en el chat.",
    menuTemplateBtn: "Cargar plantilla sugerida (20 servicios)",
    menuTemplateBtnVet: "Cargar plantilla sugerida (35 servicios)",
    menuTemplateBtnHousekeeping: "Cargar plantilla sugerida (32 servicios)",
    menuTemplateBtnPetWalk: "Cargar plantilla sugerida (12 servicios)",
    menuTemplateBtnPetSit: "Cargar plantilla sugerida (12 servicios)",
    menuTemplateBtnPetGroom: "Cargar plantilla sugerida (14 servicios)",
    menuTemplateBtnTransport: "Cargar plantilla sugerida (17 servicios)",
    menuAddRow: "+ Agregar servicio",
    menuRowNamePh: "Nombre (ej. Dobladillo de pantalón)",
    menuRowNameEsPh: "Nombre en español",
    menuRowNameEnPh: "Nombre en inglés",
    menuColEs: "ES",
    menuColEn: "EN",
    menuRowNamePhVet: "Nombre (ej. Consulta general perro/gato)",
    menuRowNamePhHousekeeping: "Nombre (ej. Baño profundo)",
    menuRowNamePhPetWalk: "Nombre (ej. Paseo 45 minutos)",
    menuRowNamePhPetSit: "Nombre (ej. Visita de chequeo 30 min)",
    menuRowNamePhPetGroom: "Nombre (ej. Estética completa perro mediano)",
    menuRowNamePhTransport: "Nombre (ej. Aeropuerto León — ida)",
    menuDisclaimer: "El precio puede ajustarse al revisar la prenda físicamente.",
    menuDisclaimerVet: "El precio puede ajustarse después del examen físico y según el peso, edad o condición del paciente.",
    menuDisclaimerHousekeeping: "El precio puede variar según el estado del hogar, el tamaño real y el acceso. Se confirma en visita o por mensaje.",
    menuDisclaimerPetWalk: "El precio puede variar según tamaño, temperamento, distancia y número de perros. Se confirma antes del paseo.",
    menuDisclaimerPetSit: "El precio puede variar según especie, número de mascotas, medicación y duración. Se confirma en mensaje o visita.",
    menuDisclaimerPetGroom: "El precio puede variar según raza, peso, estado del pelaje y comportamiento. Se confirma al revisar a la mascota.",
    menuDisclaimerTransport: "El precio puede variar por tráfico, horario, paradas extra o espera adicional. Se confirma en mensaje antes del viaje.",
    menuEmpty: "Sin servicios — toca «Cargar plantilla» o «+ Agregar servicio» para empezar.",
  },
  en: {
    title: "Service menu (fixed prices)",
    menuHint: "List common alterations with their price. Buyers will see the published menu and you can build a quote from chat.",
    menuHintVet: "List exams, vaccines, and common services at fixed prices. Clients will see the published menu and you can build a quote from chat.",
    menuHintHousekeeping: "List standard/deep cleaning by room, laundry, and add-ons at per-visit prices. In chat, multiply by frequency (daily, weekly, twice/week, monthly).",
    menuHintPetWalk: "List walk durations, extra dogs, and add-ons at per-visit prices. Clients request a quote from chat with their contact details.",
    menuHintPetSit: "List visits, boarding, and daily care at fixed prices. Clients request a quote from chat with address and preferred time.",
    menuHintPetGroom: "List baths and grooms by dog size at reference prices. Final price is confirmed when the pet is assessed.",
    menuHintTransport: "List local trips, airport runs, and special services at fixed per-trip prices. Riders pick from the menu and request a quote in chat.",
    menuTemplateBtn: "Load suggested template (20 services)",
    menuTemplateBtnVet: "Load suggested template (35 services)",
    menuTemplateBtnHousekeeping: "Load suggested template (32 services)",
    menuTemplateBtnPetWalk: "Load suggested template (12 services)",
    menuTemplateBtnPetSit: "Load suggested template (12 services)",
    menuTemplateBtnPetGroom: "Load suggested template (14 services)",
    menuTemplateBtnTransport: "Load suggested template (17 services)",
    menuAddRow: "+ Add service",
    menuRowNamePh: "Name (e.g. Pants hem)",
    menuRowNameEsPh: "Spanish name",
    menuRowNameEnPh: "English name",
    menuColEs: "ES",
    menuColEn: "EN",
    menuRowNamePhVet: "Name (e.g. General exam dog/cat)",
    menuRowNamePhHousekeeping: "Name (e.g. Deep bathroom clean)",
    menuRowNamePhPetWalk: "Name (e.g. 45-minute walk)",
    menuRowNamePhPetSit: "Name (e.g. 30-min check-in visit)",
    menuRowNamePhPetGroom: "Name (e.g. Full groom medium dog)",
    menuRowNamePhTransport: "Name (e.g. León airport — one way)",
    menuDisclaimer: "Price may change after physical inspection of the garment.",
    menuDisclaimerVet: "Price may change after physical exam and depending on the patient's weight, age, or condition.",
    menuDisclaimerHousekeeping: "Price may vary based on home condition, actual size, and access. Confirmed on visit or by message.",
    menuDisclaimerPetWalk: "Price may vary by size, temperament, distance, and number of dogs. Confirmed before the walk.",
    menuDisclaimerPetSit: "Price may vary by species, number of pets, medication needs, and duration. Confirmed by message or visit.",
    menuDisclaimerPetGroom: "Price may vary by breed, weight, coat condition, and behavior. Confirmed when the pet is assessed.",
    menuDisclaimerTransport: "Price may vary with traffic, time of day, extra stops, or additional wait time. Confirmed by message before the ride.",
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
      nameEsPh: t.menuRowNamePhVet,
      nameEnPh: t.menuRowNameEnPh,
      colEs: t.menuColEs,
      colEn: t.menuColEn,
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
      nameEsPh: t.menuRowNamePhHousekeeping,
      nameEnPh: t.menuRowNameEnPh,
      colEs: t.menuColEs,
      colEn: t.menuColEn,
      disclaimer: t.menuDisclaimerHousekeeping,
      addRow: t.menuAddRow,
      empty: t.menuEmpty,
    };
  }
  if (providerSlug === PET_WALKING_SERVICE) {
    return {
      title: t.title,
      hint: t.menuHintPetWalk,
      templateBtn: t.menuTemplateBtnPetWalk,
      nameEsPh: t.menuRowNamePhPetWalk,
      nameEnPh: t.menuRowNameEnPh,
      colEs: t.menuColEs,
      colEn: t.menuColEn,
      disclaimer: t.menuDisclaimerPetWalk,
      addRow: t.menuAddRow,
      empty: t.menuEmpty,
    };
  }
  if (providerSlug === PET_SITTING_SERVICE) {
    return {
      title: t.title,
      hint: t.menuHintPetSit,
      templateBtn: t.menuTemplateBtnPetSit,
      nameEsPh: t.menuRowNamePhPetSit,
      nameEnPh: t.menuRowNameEnPh,
      colEs: t.menuColEs,
      colEn: t.menuColEn,
      disclaimer: t.menuDisclaimerPetSit,
      addRow: t.menuAddRow,
      empty: t.menuEmpty,
    };
  }
  if (providerSlug === DOG_GROOMING_SERVICE) {
    return {
      title: t.title,
      hint: t.menuHintPetGroom,
      templateBtn: t.menuTemplateBtnPetGroom,
      nameEsPh: t.menuRowNamePhPetGroom,
      nameEnPh: t.menuRowNameEnPh,
      colEs: t.menuColEs,
      colEn: t.menuColEn,
      disclaimer: t.menuDisclaimerPetGroom,
      addRow: t.menuAddRow,
      empty: t.menuEmpty,
    };
  }
  if (providerSlug === TRANSPORT_APP_SERVICE) {
    return {
      title: t.title,
      hint: t.menuHintTransport,
      templateBtn: t.menuTemplateBtnTransport,
      nameEsPh: t.menuRowNamePhTransport,
      nameEnPh: t.menuRowNameEnPh,
      colEs: t.menuColEs,
      colEn: t.menuColEn,
      disclaimer: t.menuDisclaimerTransport,
      addRow: t.menuAddRow,
      empty: t.menuEmpty,
    };
  }
  return {
    title: t.title,
    hint: t.menuHint,
    templateBtn: t.menuTemplateBtn,
    nameEsPh: t.menuRowNamePh,
    nameEnPh: t.menuRowNameEnPh,
    colEs: t.menuColEs,
    colEn: t.menuColEn,
    disclaimer: t.menuDisclaimer,
    addRow: t.menuAddRow,
    empty: t.menuEmpty,
  };
}
