import { NextRequest, NextResponse } from "next/server";

const DEFAULT_LAT = 19.432608;
const DEFAULT_LON = -99.133209;

type WeatherDay = {
  date: string;
  max: number;
  min: number;
  code: number;
};

/** Human label from Nominatim (best-effort short). */
function formatPlace(addr: Record<string, string | undefined>, countryCode: string): string {
  const cc = (countryCode || "").toUpperCase();
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    addr.suburb;
  const state = addr.state;
  if (city && state) return `${city}, ${state}, ${cc}`;
  if (city) return `${city}, ${cc}`;
  if (state) return `${state}, ${cc}`;
  if (addr.country) return `${addr.country}, ${cc}`;
  return cc === "MX" ? "México" : cc === "US" ? "United States" : cc || "";
}

async function reverseGeocode(lat: number, lon: number): Promise<{
  label: string;
  countryCode: string;
}> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("accept-language", "es,en");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Naranjogo/1.0 (contact: hello@naranjogo.local; weather banner)",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return { label: "", countryCode: "MX" };
  }

  const data = (await res.json()) as {
    address?: Record<string, string>;
    display_name?: string;
  };
  const addr = data.address || {};
  const cc = (addr.country_code || "mx").toUpperCase();
  const label = formatPlace(addr, cc) || data.display_name?.split(",").slice(0, 2).join(",") || "";
  return { label: label || (cc === "US" ? "United States" : cc === "MX" ? "México" : cc), countryCode: cc };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const latRaw = sp.get("lat");
  const lngRaw = sp.get("lng");
  const lat = latRaw != null ? parseFloat(latRaw) : NaN;
  const lng = lngRaw != null ? parseFloat(lngRaw) : NaN;
  const valid =
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  const latitude = valid ? lat : DEFAULT_LAT;
  const longitude = valid ? lng : DEFAULT_LON;
  const isApproximate = !valid;

  let label = "";
  let countryCode = "MX";
  try {
    const geo = await reverseGeocode(latitude, longitude);
    label = geo.label;
    countryCode = geo.countryCode || "MX";
  } catch {
    label = countryCode === "US" ? "United States" : "México";
  }

  const useFahrenheit = countryCode === "US";
  const tempUnit = useFahrenheit ? "fahrenheit" : "celsius";

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(latitude));
  forecastUrl.searchParams.set("longitude", String(longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,weather_code,is_day");
  forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("forecast_days", "6");
  forecastUrl.searchParams.set("temperature_unit", tempUnit);

  const wRes = await fetch(forecastUrl.toString(), { next: { revalidate: 900 } });
  if (!wRes.ok) {
    return NextResponse.json({ error: "weather_unavailable" }, { status: 502 });
  }

  const w = (await wRes.json()) as {
    current?: { temperature_2m: number; weather_code: number; is_day?: number };
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
    };
    timezone?: string;
  };

  const daily = w.daily;
  if (!daily?.time?.length) {
    return NextResponse.json({ error: "weather_malformed" }, { status: 502 });
  }

  const days: WeatherDay[] = daily.time.map((date, i) => ({
    date,
    max: Math.round(daily.temperature_2m_max[i] ?? 0),
    min: Math.round(daily.temperature_2m_min[i] ?? 0),
    code: daily.weather_code[i] ?? 0,
  }));

  const current = w.current;
  const currentTemp = current != null ? Math.round(current.temperature_2m) : days[0] ? Math.round((days[0].max + days[0].min) / 2) : 0;
  const currentCode = current?.weather_code ?? days[0]?.code ?? 0;
  const isDay = (current?.is_day ?? 1) === 1;

  return NextResponse.json({
    label,
    countryCode,
    useFahrenheit,
    timezone: w.timezone ?? "America/Mexico_City",
    isApproximate,
    current: {
      temp: currentTemp,
      code: currentCode,
      isDay,
    },
    days,
  });
}
