import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, MapPin, Search, Sun, Thermometer, Wind, Droplets, CloudRain, CloudSun, Moon, Navigation, Siren } from "lucide-react";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, Marker, Popup, LayersControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// jWeather App (React + Tailwind + shadcn-like UI components)

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
});

const RAINVIEWER_TILE = (z: number) =>
  `https://tilecache.rainviewer.com/v2/radar/nowcast/${z}/256/{z}/{x}/{y}/2/1_1.png`;

const formatTemp = (t?: number | null) =>
  typeof t === "number" && !Number.isNaN(t) ? `${Math.round(t)}°` : "—";

const degToCompass = (num?: number | null) => {
  if (typeof num !== "number") return "—";
  const val = Math.floor(num / 22.5 + 0.5);
  const arr = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return arr[val % 16];
};

const shimmer = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

type Suggestion = {
  label: string;
  city: string;
  state?: string;
  lat: number;
  lon: number;
  zip?: string;
};

type Location = Suggestion & { country?: string };

type CurrentBlock = {
  temperature: number | null;
  windspeed: number | null;
  winddirection: number | null;
  relativehumidity: number | null;
  weathercode: number | null;
};

type DailyBlock = Array<{
  date: string;
  tmax: number | null;
  tmin: number | null;
  precip: number | null;
  weathercode: number | null;
}>;

type AlertItem = {
  id: string;
  headline: string;
  event: string;
  severity?: string;
  areaDesc?: string;
  effective?: string;
  expires?: string;
  instruction?: string;
  description?: string;
  senderName?: string;
  url?: string;
};

const weatherCodeMap: Record<number, { icon: React.ReactNode; label: string }> = {
  0: { icon: <Sun className="w-4 h-4" />, label: "Clear" },
  1: { icon: <CloudSun className="w-4 h-4" />, label: "Mainly clear" },
  2: { icon: <CloudSun className="w-4 h-4" />, label: "Partly cloudy" },
  3: { icon: <CloudSun className="w-4 h-4" />, label: "Overcast" },
  45: { icon: <CloudSun className="w-4 h-4" />, label: "Fog" },
  48: { icon: <CloudSun className="w-4 h-4" />, label: "Depositing rime fog" },
  51: { icon: <CloudRain className="w-4 h-4" />, label: "Drizzle" },
  53: { icon: <CloudRain className="w-4 h-4" />, label: "Drizzle" },
  55: { icon: <CloudRain className="w-4 h-4" />, label: "Drizzle" },
  61: { icon: <CloudRain className="w-4 h-4" />, label: "Rain" },
  63: { icon: <CloudRain className="w-4 h-4" />, label: "Rain" },
  65: { icon: <CloudRain className="w-4 h-4" />, label: "Heavy rain" },
  71: { icon: <CloudRain className="w-4 h-4" />, label: "Snow" },
  73: { icon: <CloudRain className="w-4 h-4" />, label: "Snow" },
  75: { icon: <CloudRain className="w-4 h-4" />, label: "Heavy snow" },
  80: { icon: <CloudRain className="w-4 h-4" />, label: "Showers" },
  81: { icon: <CloudRain className="w-4 h-4" />, label: "Showers" },
  82: { icon: <CloudRain className="w-4 h-4" />, label: "Heavy showers" },
  95: { icon: <CloudRain className="w-4 h-4" />, label: "Thunderstorm" },
  96: { icon: <CloudRain className="w-4 h-4" />, label: "Thunderstorm" },
  99: { icon: <CloudRain className="w-4 h-4" />, label: "Thunderstorm" },
};

export default function App() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loc, setLoc] = useState<Location | null>(null);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<CurrentBlock | null>(null);
  const [daily, setDaily] = useState<DailyBlock | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [zoom, setZoom] = useState(6);

  // Debounce helper
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Autosuggest
  useEffect(() => {
    const run = async () => {
      const q = debounced.trim();
      if (!q) { setSuggestions([]); return; }
      try {
        if (/^\d{5}$/.test(q)) {
          const r = await fetch(`https://api.zippopotam.us/us/${q}`);
          if (r.ok) {
            const j = await r.json();
            const place = j.places?.[0];
            if (place) {
              const s: Suggestion = {
                label: `${place["place name"]}, ${place["state abbreviation"]} (${q})`,
                city: place["place name"],
                state: place["state abbreviation"],
                lat: parseFloat(place.latitude),
                lon: parseFloat(place.longitude),
                zip: q,
              };
              setSuggestions([s]);
              return;
            }
          }
        }
        const nomi = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(q)}`,
          { headers: { "Accept-Language": "en-US" } }
        );
        const data = await nomi.json();
        const items: Suggestion[] = (data || [])
          .filter((x: any) => x.type === "city" || x.class === "place")
          .map((x: any) => {
            const adr = x.address || {};
            const city = adr.city || adr.town || adr.village || x.display_name?.split(",")[0];
            const state = adr.state || adr.region || adr.county;
            const country = adr.country_code?.toUpperCase();
            return {
              label: `${city}${state ? ", " + state : ""}${country ? " (" + country + ")" : ""}`,
              city,
              state,
              lat: parseFloat(x.lat),
              lon: parseFloat(x.lon),
            };
          });
        setSuggestions(items);
      } catch (e) {
        console.error(e);
        setSuggestions([]);
      }
    };
    run();
  }, [debounced]);

  // Fetch weather + alerts when a location is selected
  useEffect(() => {
    const run = async () => {
      if (!loc) return;
      setLoading(true);
      try {
        const wm = new URL("https://api.open-meteo.com/v1/forecast");
        wm.searchParams.set("latitude", String(loc.lat));
        wm.searchParams.set("longitude", String(loc.lon));
        wm.searchParams.set("current", [
          "temperature_2m",
          "relative_humidity_2m",
          "wind_speed_10m",
          "wind_direction_10m",
          "weather_code",
        ].join(","));
        wm.searchParams.set("daily", [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_sum",
        ].join(","));
        wm.searchParams.set("timezone", "auto");

        const [wRes, aRes] = await Promise.all([
          fetch(wm.toString()),
          fetch(`https://api.weather.gov/alerts?point=${loc.lat},${loc.lon}`),
        ]);

        const wj = await wRes.json();
        const cj: CurrentBlock = {
          temperature: wj.current?.temperature_2m ?? null,
          windspeed: wj.current?.wind_speed_10m ?? null,
          winddirection: wj.current?.wind_direction_10m ?? null,
          relativehumidity: wj.current?.relative_humidity_2m ?? null,
          weathercode: wj.current?.weather_code ?? null,
        };
        const dj: DailyBlock = (wj.daily?.time || []).map((t: string, i: number) => ({
          date: t,
          tmax: wj.daily.temperature_2m_max?.[i] ?? null,
          tmin: wj.daily.temperature_2m_min?.[i] ?? null,
          precip: wj.daily.precipitation_sum?.[i] ?? null,
          weathercode: wj.daily.weather_code?.[i] ?? null,
        }));
        setCurrent(cj);
        setDaily(dj);

        const aj = await aRes.json();
        const feats = aj.features || [];
        const list: AlertItem[] = feats.map((f: any) => ({
          id: f.id,
          headline: f.properties.headline,
          event: f.properties.event,
          severity: f.properties.severity,
          areaDesc: f.properties.areaDesc,
          effective: f.properties.effective,
          expires: f.properties.expires,
          instruction: f.properties.instruction,
          description: f.properties.description,
          senderName: f.properties.senderName,
          url: f.properties?.id,
        }));
        setAlerts(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [loc]);

  const onPick = (s: Suggestion) => {
    setLoc({ ...s, country: "US" });
    setQuery(`${s.city}${s.state ? ", " + s.state : ""}`);
    setSuggestions([]);
    setZoom(8);
  };

  const CurrentConditions = () => (
    <Card className="rounded-2xl shadow-sm border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Thermometer className="w-4 h-4" /> Current Conditions
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoTile label="Temp" value={formatTemp(current?.temperature)} icon={<Sun className="w-4 h-4" />} />
        <InfoTile label="Humidity" value={current?.relativehumidity != null ? `${current?.relativehumidity}%` : "—"} icon={<Droplets className="w-4 h-4" />} />
        <InfoTile label="Wind" value={current?.windspeed != null ? `${Math.round(current?.windspeed)} mph` : "—"} icon={<Wind className="w-4 h-4" />} />
        <InfoTile label="Direction" value={degToCompass(current?.winddirection)} icon={<Navigation className="w-4 h-4" />} />
      </CardContent>
    </Card>
  );

  const AlertsPanel = () => (
    <Card className="rounded-2xl shadow-sm border-border/60 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Siren className="w-4 h-4" /> Active Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 && (
          <div className="text-sm text-muted-foreground">No active alerts.</div>
        )}
        {alerts.slice(0, 6).map((a) => (
          <motion.div key={a.id} variants={shimmer} initial="hidden" animate="show" className="p-3 rounded-xl border bg-muted/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <div className="font-medium leading-tight">{a.event}</div>
                {a.severity && (
                  <div className="text-xs text-muted-foreground mt-0.5">Severity: {a.severity}</div>
                )}
                {a.areaDesc && (
                  <div className="text-xs text-muted-foreground truncate">{a.areaDesc}</div>
                )}
                {a.expires && (
                  <div className="text-[11px] text-muted-foreground mt-1">Until {new Date(a.expires).toLocaleString()}</div>
                )}
                {a.url && (
                  <a className="text-xs underline mt-1 inline-block" href={a.url} target="_blank" rel="noreferrer">Details</a>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );

  const Forecast7Day = () => (
    <Card className="rounded-2xl shadow-sm border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Moon className="w-4 h-4" /> 7-Day Forecast
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {daily?.slice(0, 7).map((d) => (
            <div key={d.date} className="rounded-xl border p-3 bg-muted/20">
              <div className="text-sm font-medium">
                {new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
              <div className="flex items-center gap-2 my-2">
                {weatherCodeMap[d.weathercode ?? 0]?.icon}
                <span className="text-xs text-muted-foreground">
                  {weatherCodeMap[d.weathercode ?? 0]?.label || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{formatTemp(d.tmax)}</span>
                <span className="text-muted-foreground">{formatTemp(d.tmin)}</span>
              </div>
              {d.precip != null && (
                <div className="text-[11px] text-muted-foreground mt-1">Precip: {Math.round(d.precip)} mm</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const Radar = () => (
    <Card className="rounded-2xl shadow-sm border-border/60 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4" /> Radar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[360px] rounded-xl overflow-hidden border">
          <MapContainer center={[loc?.lat || 39.5, loc?.lon || -98.35]} zoom={zoom} className="h-full w-full" scrollWheelZoom>
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.Overlay checked name="RainViewer">
                <TileLayer url={RAINVIEWER_TILE(8)} opacity={0.65} />
              </LayersControl.Overlay>
            </LayersControl>
            {loc && (
              <Marker position={[loc.lat, loc.lon]} icon={markerIcon}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-medium">{loc.city}{loc.state ? ", " + loc.state : ""}</div>
                    <div className="text-muted-foreground text-xs">{loc.lat.toFixed(3)}, {loc.lon.toFixed(3)}</div>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40 text-foreground">
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <img src="http://thejweather.com/elements/images/logo.png" alt="jWeather" className="h-7 w-auto" />
              <div className="hidden md:block text-sm text-muted-foreground">Ultra-modern weather for everywhere</div>
            </div>
            <div className="relative w-full max-w-xl">
              <div className="flex items-center gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search city, state or ZIP…"
                  className="rounded-2xl pl-9"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Button className="rounded-2xl" onClick={() => suggestions[0] && onPick(suggestions[0])}>Go</Button>
              </div>
              {suggestions.length > 0 && (
                <motion.ul
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute mt-2 w-full rounded-2xl border bg-popover shadow-lg overflow-hidden max-h-80 overflow-y-auto"
                >
                  {suggestions.map((s) => (
                    <li key={`${s.label}-${s.lat}-${s.lon}`}>
                      <button
                        onClick={() => onPick(s)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2"
                      >
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm">{s.label}</span>
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {loc ? (<span>{loc.city}{loc.state ? ", " + loc.state : ""}</span>) : (<span>Search a location to get started</span>)}
          </h1>
          {loc && (<p className="text-muted-foreground text-sm mt-1">{loc.lat.toFixed(3)}, {loc.lon.toFixed(3)}</p>)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {loading ? (
              <LoadingBlock />
            ) : (
              <>
                {current && <CurrentConditions />}
                {daily && <Forecast7Day />}
              </>
            )}
          </div>
          <div className="lg:col-span-1 space-y-6">
            {loc ? <Radar /> : <PlaceholderCard title="Radar" />}
            {loc ? <AlertsPanel /> : <PlaceholderCard title="Active Alerts" />}
          </div>
        </div>
      </main>

      <footer className="border-t mt-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 text-xs text-muted-foreground flex flex-wrap items-center gap-3 justify-between">
          <div>Data: Open‑Meteo, NWS Alerts, OSM/Nominatim, RainViewer tiles</div>
          <div>© {new Date().getFullYear()} jWeather</div>
        </div>
      </footer>
    </div>
  );
}

function InfoTile({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3 bg-muted/20">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        {icon} <span>{label}</span>
      </div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <Card className="rounded-2xl shadow-sm border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">Select a location to load {title.toLowerCase()}.</div>
      </CardContent>
    </Card>
  );
}
