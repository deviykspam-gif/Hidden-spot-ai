import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, useMap, AttributionControl } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Download,
  Eye,
  LocateFixed,
  MapPin,
  Navigation,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Waves,
  X,
  Heart,
  LogOut,
  UserRound,
  Globe2,
  Trees,
  Building2,
  Moon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";
import { fetchSpots, type Spot, type SpotCategory } from "@/data/spots";
import { supabase } from "@/integrations/supabase/client";
import AuthModal from "@/components/AuthModal";
import { generateLocalSpots, hyderabad } from "@/data/localSpots";

const categories: Array<"All" | SpotCategory> = [
  "All",
  "Waterfalls",
  "Viewpoints",
  "Lakes",
  "Trekking",
];

type Coordinates = { latitude: number; longitude: number };
type LocatedSpot = Spot & { distanceKm: number };
type Vibe = "all" | "solitude" | "thrill" | "scenic";
type Radius = 10 | 25 | 50 | "all";
type SpotWorld = "nature" | "urban";
type MapMode = "dark" | "satellite";

const fallbackLocation: Coordinates = { latitude: 30.58, longitude: 78.47 };
const radiusOptions: Array<{ value: Radius; label: string }> = [
  { value: 10, label: "10 km" }, { value: 25, label: "25 km" },
  { value: 50, label: "50 km" }, { value: "all", label: "All" },
];
const vibes: Array<{ value: Vibe; label: string; Icon: typeof Sparkles }> = [
  { value: "all", label: "All Vibes", Icon: Sparkles },
  { value: "solitude", label: "Solitude & Peace", Icon: Waves },
  { value: "thrill", label: "High Thrill", Icon: AlertTriangle },
  { value: "scenic", label: "Scenic Views", Icon: Eye },
];

function haversineDistance(a: Coordinates, b: Coordinates) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function vibeMatch(spot: Spot, vibe: Vibe) {
  const score = vibe === "solitude" ? spot.solitudeScore : vibe === "thrill" ? spot.thrillLevel : vibe === "scenic" ? spot.scenicScore : (spot.solitudeScore + spot.thrillLevel + spot.scenicScore) / 3;
  return Math.round(72 + (score / 5) * 24);
}

function isUrbanSpot(spot: Spot) {
  return /urban|city|street|rooftop|market|architecture|heritage|fort|cafe/i.test(`${spot.terrain} ${spot.title} ${spot.description}`);
}

function getStickerForCategory(category: string) {
  switch (category.toLowerCase()) {
    case "waterfalls": return "https://img.icons8.com/color/96/waterfall.png";
    case "viewpoints": return "https://img.icons8.com/color/96/binoculars.png";
    case "lakes": return "https://img.icons8.com/color/96/lake.png";
    case "trekking": return "https://img.icons8.com/color/96/trekking.png";
    default: return "https://img.icons8.com/color/96/marker--v1.png";
  }
}

function SpotMarkerGraphic({ spot, active, onSelect }: { spot: Spot; active: boolean; onSelect: () => void }) {
  return (
    <motion.div
      key={`${spot.id}-${active ? "selected" : "visible"}`}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.25, 1], opacity: 1 }}
      transition={{
        scale: { delay: active ? 1.3 : 0, duration: 0.5, times: [0, 0.7, 1], ease: [0.32, 0.72, 0, 1] },
        opacity: { delay: active ? 1.3 : 0, duration: 0.18 },
      }}
      className={`sticker-pin-shell ${active ? "is-active z-50 relative" : "z-10 relative"}`}
    >
      <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        <motion.button
          type="button"
          onClick={onSelect}
          aria-label={`Open ${spot.title}`}
          className="group relative flex items-center justify-center outline-none"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <div className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur-xl border border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.3)] transition-all duration-300 group-hover:bg-black/60 group-hover:shadow-[0_8px_32px_rgba(255,255,255,0.15)] ${active ? 'ring-2 ring-primary bg-black/60' : ''}`}>
            <img 
              className="relative z-10 h-7 w-7 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:scale-110" 
              src={getStickerForCategory(spot.category)} 
              alt={spot.category} 
              draggable={false} 
              loading="eager" 
            />
          </div>
          <div className="absolute -bottom-2 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-[100%] bg-black/60 blur-[3px]" />
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function MapController({ selected, userLocation, recenterToken }: { selected: LocatedSpot | null; userLocation: Coordinates | null; recenterToken: number }) {
  const { current: map } = useMap();
  const selectedId = useRef<string | null>(null);
  const lastRecenterToken = useRef(0);
  const hasFlownIn = useRef(false);
  const easing = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  useEffect(() => {
    if (!map) return;

    // Safely execute setFog for MapLibre atmosphere support
    try {
      const mapInstance = map.getMap() as unknown as { setFog?: (fog: object) => void };
      if (typeof mapInstance.setFog === "function") {
        mapInstance.setFog({
          color: "rgba(255, 255, 255, 0.15)",
          "high-color": "rgba(36, 99, 235, 0.4)",
          "space-color": "rgba(0, 0, 0, 1)",
          "horizon-blend": 0.05
        });
      }
    } catch (err) {
      console.warn("MapLibre atmospheric fog not supported on current layer configuration", err);
    }

    if (hasFlownIn.current) return;
    hasFlownIn.current = true;
    setTimeout(() => {
      map.flyTo({ center: [78.4866, 17.385], zoom: 11, pitch: 45, duration: 3500, easing, essential: true });
    }, 600);
  }, [map]);

  useEffect(() => {
    if (!map || !selected || selectedId.current === selected.id) return;
    selectedId.current = selected.id;
    map.flyTo({ center: [selected.longitude, selected.latitude], duration: 1800, pitch: 50, zoom: 14, easing, essential: true });
  }, [map, selected]);

  useEffect(() => {
    if (!map || recenterToken === 0 || recenterToken === lastRecenterToken.current || !userLocation) return;
    lastRecenterToken.current = recenterToken;
    map.flyTo({ center: [userLocation.longitude, userLocation.latitude], duration: 1800, pitch: 50, zoom: 14, easing, essential: true });
  }, [map, recenterToken, userLocation]);

  return null;
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

function downloadGpx(spot: Spot) {
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Hidden Spot Finder" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="${spot.latitude}" lon="${spot.longitude}"><name>${escapeXml(spot.title)}</name><desc>${escapeXml(spot.description)}</desc></wpt></gpx>`;
  const href = URL.createObjectURL(new Blob([content], { type: "application/gpx+xml" }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${spot.title.toLowerCase().replaceAll(" ", "-")}.gpx`;
  anchor.click();
  URL.revokeObjectURL(href);
}

export default function HiddenSpotMap() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LocatedSpot | null>(null);
  const [radius, setRadius] = useState<Radius>("all");
  const [vibe, setVibe] = useState<Vibe>("all");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<"locating" | "ready" | "unavailable">("locating");
  const [dbSpots, setDbSpots] = useState<Spot[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "local">("loading");
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [world, setWorld] = useState<SpotWorld>("nature");
  const [mapMode, setMapMode] = useState<MapMode>("satellite");
  const [recenterToken, setRecenterToken] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem("hidden-spots-mode") as MapMode;
    const initialMode = stored && (stored === "dark" || stored === "satellite") ? stored : "satellite";
    setMapMode(initialMode);
    document.documentElement.classList.toggle("dark", true);
  }, []);

  function toggleMapMode() {
    const nextMode = mapMode === "dark" ? "satellite" : "dark";
    setMapMode(nextMode);
    window.localStorage.setItem("hidden-spots-mode", nextMode);
  }

  const mapStyleUrl = useMemo<string | StyleSpecification>(() => {
    if (mapMode === "dark") {
      return {
        version: 8,
        projection: { type: "globe" },
        sources: {
          "esri-dark": { 
            type: "raster", 
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"], 
            tileSize: 256, 
            attribution: "Imagery © Esri",
            maxzoom: 16
          }
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#000000" } },
          { id: "dark-layer", type: "raster", source: "esri-dark", minzoom: 0, maxzoom: 22 }
        ]
      } as StyleSpecification;
    }
    
    return {
      version: 8,
      projection: { type: "globe" },
      sources: {
        "google-earth-satellite": { 
          type: "raster", 
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], 
          tileSize: 256, 
          attribution: "Imagery © Esri", 
          maxzoom: 19 
        }
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#000000" } },
        { id: "satellite-layer", type: "raster", source: "google-earth-satellite", minzoom: 0, maxzoom: 22 }
      ]
    } as StyleSpecification;
  }, [mapMode]);

  useEffect(() => {
    fetchSpots().then((rows) => { setDbSpots(rows); setLoadState(rows.length ? "ready" : "local"); }).catch((err) => { console.warn("Spots unavailable", err); setLoadState("local"); });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setFavorites(new Set()); return; }
    supabase.from("user_favorites").select("spot_id").then(({ data }) => setFavorites(new Set((data ?? []).map((r) => r.spot_id))));
  }, [user]);

  async function toggleFavorite(spotId: string) {
    const isFav = favorites.has(spotId);
    const next = new Set(favorites);
    if (isFav) next.delete(spotId); else next.add(spotId);
    if (spotId.startsWith("local-")) { setFavorites(next); return; }
    if (!user) { setAuthOpen(true); return; }
    setFavorites(next);
    const { error } = isFav ? await supabase.from("user_favorites").delete().eq("spot_id", spotId).eq("user_id", user.id) : await supabase.from("user_favorites").insert({ spot_id: spotId, user_id: user.id });
    if (error) setFavorites(favorites);
  }

  useEffect(() => {
    if (!("geolocation" in navigator)) { setLocationState("unavailable"); return; }
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => { setUserLocation({ latitude: coords.latitude, longitude: coords.longitude }); setLocationState("ready"); },
      () => setLocationState("unavailable"),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const usingLocal = loadState === "local";
  const discoveryOrigin = userLocation ?? (usingLocal ? hyderabad : fallbackLocation);
  const localSeed = userLocation ?? (locationState === "locating" ? null : hyderabad);
  const localSpots = useMemo(() => (usingLocal && localSeed ? generateLocalSpots(localSeed) : []), [usingLocal, localSeed?.latitude, localSeed?.longitude]);
  const sourceSpots = usingLocal ? localSpots : dbSpots;
  const activeFilters = (category !== "All" ? 1 : 0) + (vibe !== "all" ? 1 : 0) + (radius !== "all" ? 1 : 0);
  const nearbySpots = useMemo<LocatedSpot[]>(() => sourceSpots.filter((spot) => Number.isFinite(spot.latitude) && Number.isFinite(spot.longitude)).map((spot) => ({ ...spot, distanceKm: haversineDistance(discoveryOrigin, spot) })), [sourceSpots, discoveryOrigin.latitude, discoveryOrigin.longitude]);
  const visibleSpots = useMemo(() => {
    const term = query.trim().toLowerCase();
    return nearbySpots.filter((spot) => (category === "All" || spot.category === category) && (world === "urban" ? isUrbanSpot(spot) : !isUrbanSpot(spot)) && (radius === "all" || spot.distanceKm <= radius) && (vibe === "all" || (vibe === "solitude" && spot.solitudeScore >= 4) || (vibe === "thrill" && spot.thrillLevel >= 4) || (vibe === "scenic" && spot.scenicScore >= 4)) && (!term || `${spot.title} ${spot.category} ${spot.description}`.toLowerCase().includes(term)));
  }, [category, nearbySpots, query, radius, vibe, world]);

  useEffect(() => { if (selected && !visibleSpots.some((spot) => spot.id === selected.id)) setSelected(null); }, [selected, visibleSpots]);
  useEffect(() => {
    if (!selected) return;
    const updatedSpot = nearbySpots.find((spot) => spot.id === selected.id);
    if (updatedSpot && updatedSpot.distanceKm !== selected.distanceKm) setSelected(updatedSpot);
  }, [nearbySpots, selected]);

  return (
    <main className="relative h-dvh min-h-[620px] overflow-hidden bg-black font-sans text-foreground">
      
      <style>{`
        @keyframes space-drift { from { background-position: 0% 0%; } to { background-position: -200% -100%; } }
        .starfield-bg {
          background-color: #000000;
          background-image: 
            radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.5) 0%, rgba(0, 0, 0, 1) 100%),
            url('https://www.transparenttextures.com/patterns/stardust.png');
          animation: space-drift 180s linear infinite;
        }

        /* User GPS pulse radar styling */
        .user-radar {
          position: relative;
          width: 16px;
          height: 16px;
          background-color: #3b82f6;
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.8);
        }

        .user-radar span {
          position: absolute;
          top: -8px;
          left: -8px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background-color: rgba(59, 130, 246, 0.4);
          animation: radar-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }

        @keyframes radar-ping {
          75%, 100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }

        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      
      <div className="absolute inset-0 z-0 starfield-bg">
        <Map
          id="hidden-spots-map"
          projection="globe"
          minZoom={1}
          maxZoom={19}
          initialViewState={{ longitude: 78.4866, latitude: 17.385, zoom: 11, pitch: 45, bearing: 0 }}
          mapStyle={mapStyleUrl}
          mapLib={maplibregl}
          style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
          reuseMaps
        >
          <AttributionControl position="bottom-right" style={{ zIndex: 10 }} />
          <MapController selected={selected} userLocation={userLocation} recenterToken={recenterToken} />
          {userLocation && (
            <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center" style={{ zIndex: 1000 }}>
              <div className="user-radar" role="img" aria-label="Your location"><span /></div>
            </Marker>
          )}
          
          {visibleSpots.map((spot) => {
            const isSelected = selected?.id === spot.id;
            return (
              <Marker key={spot.id} longitude={spot.longitude} latitude={spot.latitude} anchor="bottom" style={{ zIndex: isSelected ? 900 : 700 }}>
                <SpotMarkerGraphic spot={spot} active={isSelected} onSelect={() => setSelected(spot)} />
              </Marker>
            );
          })}
        </Map>
      </div>

      <div className="pointer-events-none absolute inset-0 z-[400] bg-map-vignette opacity-70" />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-5">
        <div className="mx-auto flex max-w-3xl items-start gap-2">
          
          <motion.div className="relative pointer-events-auto min-w-0 flex-1" initial={{ opacity: 0, y: -28, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ type: "spring", stiffness: 350, damping: 25 }}>
            <div className="rounded-3xl bg-black/40 backdrop-blur-3xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] p-2 sm:p-2.5">
              <div className="flex items-center gap-2">
                <label className="relative min-w-0 flex-1">
                  <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/70" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onFocus={() => setPanelOpen(true)}
                    placeholder="Search locations..."
                    className="h-11 w-full rounded-full bg-white/5 border border-white/10 pl-10 pr-9 text-sm text-white outline-none placeholder:text-white/50 transition-all duration-300 focus:bg-white/10 focus:border-white/30"
                  />
                  {query && (
                    <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="liquid-press absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white/50 hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 transition-all">
                      <X className="size-4" />
                    </button>
                  )}
                </label>
                <Button variant={panelOpen ? "default" : "secondary"} size="icon" onClick={() => setPanelOpen((v) => !v)} aria-label={panelOpen ? "Hide filters" : "Show filters"} aria-expanded={panelOpen} className={`tactile relative size-11 shrink-0 rounded-full border transition-all duration-300 hover:scale-105 active:scale-95 ${panelOpen ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/30' : 'bg-white/5 border-white/10 text-white hover:b
