/** WMO weather interpretation codes → icon (Unicode). Ref: Open-Meteo docs. */
export function weatherEmoji(code: number, isDay = true): string {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if ([1].includes(code)) return isDay ? "🌤️" : "☁️";
  if ([2].includes(code)) return "⛅";
  if ([3].includes(code)) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌤️";
}
