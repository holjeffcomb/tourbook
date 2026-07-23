import { useFocusEffect } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import type { ColorToken } from '@/theme';
import type { MapStyleVariant } from './mapConfig';

// ---------------------------------------------------------------------------
// Shared map scene model
//
// The app has a single persistent map (`MapStage`) rendered on top of the
// authenticated navigator, with each screen's UI teleported into an overlay
// layer above it. Map-centric screens don't render their own maps or (visually)
// their own bodies; instead each one *registers* a scene (what to draw + where
// to aim) plus its overlay UI while focused. The stage renders the focused
// scene and springs its camera between scenes, so the map reads as one
// continuous, living surface that UI floats over — and, because the map sits
// above the navigator, it stays fully pan/zoom interactive.
// ---------------------------------------------------------------------------

export type Coord = [number, number];

/**
 * Approximate default React Navigation bottom tab bar height (excluding the
 * bottom safe-area inset, which callers add). Used so the shared map + overlay
 * stay clear of the tab bar on top-level tab screens.
 */
export const TAB_BAR_HEIGHT = 58;

/** A visited place for the clustered "Lifetime" overlay. */
export type MapPlace = {
  id: string;
  latitude: number;
  longitude: number;
  weight?: number;
  label?: string;
  city?: string;
  tourCount?: number;
  /** Act / tour names that stopped here (for the inspect card). */
  tourNames?: string[];
  firstVisit?: string | null;
  lastVisit?: string | null;
};

/** An ordered tour route ([lng, lat] pairs). */
export type RouteLine = {
  id: string;
  coordinates: Coord[];
  /** Explicit line colour (hex). When omitted, the Lifetime "heat" style is used. */
  color?: string;
};

/**
 * One step in the Lifetime "ambient" cinematic loop: the camera dissolves in at
 * `center`/`zoom`, then slowly pans to `driftTo` (same zoom) over `dwellMs`.
 * Built by the pure `ambientPlan` module; played by `useAmbientCamera`.
 */
export type AmbientFrame = {
  center: Coord;
  zoom: number;
  driftTo: Coord;
  dwellMs: number;
};

/** An ordered, looping itinerary of ambient camera frames (one per cluster). */
export type AmbientPlan = { frames: AmbientFrame[] };

/** Which Lifetime overlay is showing. */
export type PlacesMapMode = 'places' | 'routes';

/** Space (px) the map keeps clear of floating chrome when framing content. */
export type MapContentInsets = { top?: number; bottom?: number; left?: number; right?: number };

/** A group of polyline segments sharing one style (e.g. a tour's solid legs). */
export type SceneLineGroup = {
  id: string;
  /** Each entry is a polyline of >= 2 coordinates. */
  segments: Coord[][];
  style?: 'solid' | 'dashed';
  color?: ColorToken;
  width?: number;
};

/** A labelled pin drawn with a custom themed marker view. */
export type SceneMarker = {
  id: string;
  coordinate: Coord;
  kind: 'show' | 'off' | 'tbd' | 'you' | 'them' | 'venue';
  /** Text inside the marker (e.g. a show number, "You"/"Them"). */
  label?: string;
};

export type MapScene = {
  /** Stable identity for the owning screen; a change re-frames the camera. */
  key: string;
  /**
   * Token controlling when the camera re-frames *within* a scene. The camera
   * only re-aims when this value changes (defaults to `key`). Leave it stable
   * for incidental data changes (e.g. selecting a place); vary it for
   * intentional re-frames (year filter, selected stop, route set).
   */
  frameKey?: string;
  /**
   * How to derive the camera frame from scene coordinates.
   * - `bounds` (default): fit every point — right for a single tour.
   * - `trimmed`: center on all points, but size zoom from ~80% so Lifetime /
   *   tour lists don't zoom out to the whole world for edge outliers.
   */
  focusMode?: 'bounds' | 'trimmed';
  variant?: MapStyleVariant;
  /** Clustered visited places (Lifetime). */
  places?: MapPlace[];
  /** Tour routes for the Lifetime routes overlay. */
  routes?: RouteLine[];
  /** Which overlay to show when both places and routes exist. */
  placesMode?: PlacesMapMode;
  /** Explicit polylines (tour legs, near-miss connector). */
  lines?: SceneLineGroup[];
  /** Explicit pins (tour stops, you/them, venue). */
  markers?: SceneMarker[];
  /** Coordinates the camera should frame. Falls back to places/markers/lines. */
  focus?: Coord[];
  /**
   * When set, the stage plays this ambient cinematic loop instead of the static
   * framing — slowly panning across clusters and dissolving between them. Paused
   * automatically while the user interacts or a place is selected.
   */
  ambient?: AmbientPlan;
  /** Zoom used when there is a single focus point. */
  singleZoom?: number;
  /** Camera animation duration (ms) for in-scene re-frames. Defaults to 700. */
  focusDurationMs?: number;
  /**
   * Camera easing for in-scene re-frames. `flyTo` arcs out and back in for a
   * cinematic glide; defaults to `easeTo`.
   */
  focusAnimationMode?: 'flyTo' | 'easeTo' | 'linearTo' | 'moveTo';
  /** Keep content clear of floating chrome (header height, sheet height). */
  contentInsets?: MapContentInsets;
  /** Allow the user to pan/zoom (default true). */
  interactive?: boolean;
  /**
   * Currently inspected Lifetime place (controlled). When set, the stage draws
   * a selection ring; the owning screen renders the detail card in its overlay
   * so it sits above the map chrome.
   */
  selectedPlaceId?: string | null;
  /**
   * Fired when a place marker is tapped, or with `null` when a cluster is
   * expanded / selection should clear.
   */
  onSelectPlace?: (id: string | null) => void;
  /** Fired when a numbered tour stop marker is tapped (tour detail). */
  onSelectStop?: (id: string) => void;
  /** Fired when a custom pin (you / them / venue) is tapped. */
  onSelectMarker?: (marker: SceneMarker) => void;
  /** Fired when the user taps empty map (not a marker) — clear floating panes. */
  onPressMapBackground?: () => void;
  /**
   * Bottom chrome (px) the map + overlay must not cover — e.g. the tab bar on
   * top-level tab screens — so it stays visible and tappable behind them.
   */
  bottomChrome?: number;
};

/** A focused map screen: its scene (map contents) plus its overlay UI. */
export type MapEntry = {
  key: string;
  scene: MapScene;
  overlay: ReactNode;
  seq: number;
};

type MapControls = {
  register: (key: string, scene: MapScene, overlay: ReactNode) => void;
  release: (key: string) => void;
};

// Split so screens subscribe only to the (stable) controls and never re-render
// when the active entry changes — otherwise re-registering the overlay would
// loop. Only the stage/outlet subscribe to the active entry.
const MapControlsContext = createContext<MapControls | null>(null);
const MapActiveContext = createContext<MapEntry | null>(null);

// Grace period so a map→map transition (blur of the old screen, focus of the
// new one) never briefly empties the registry and flickers the map away.
const RELEASE_DELAY_MS = 60;

export function MapSceneProvider({ children }: PropsWithChildren) {
  const [entries, setEntries] = useState<MapEntry[]>([]);
  const seqRef = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const register = useCallback((key: string, scene: MapScene, overlay: ReactNode) => {
    const pending = timers.current[key];
    if (pending) {
      clearTimeout(pending);
      delete timers.current[key];
    }
    seqRef.current += 1;
    const seq = seqRef.current;
    setEntries((prev) => [...prev.filter((e) => e.key !== key), { key, scene, overlay, seq }]);
  }, []);

  const release = useCallback((key: string) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      setEntries((prev) => prev.filter((e) => e.key !== key));
    }, RELEASE_DELAY_MS);
  }, []);

  const controls = useMemo(() => ({ register, release }), [register, release]);
  const active = useMemo(
    () => (entries.length ? entries.reduce((a, b) => (b.seq > a.seq ? b : a)) : null),
    [entries],
  );

  return (
    <MapControlsContext.Provider value={controls}>
      <MapActiveContext.Provider value={active}>{children}</MapActiveContext.Provider>
    </MapControlsContext.Provider>
  );
}

/** The focused screen's map entry (scene + overlay), read by the stage/outlet. */
export function useActiveMapEntry(): MapEntry | null {
  return use(MapActiveContext);
}

function useSceneControls(): MapControls {
  const ctx = use(MapControlsContext);
  if (!ctx) throw new Error('useMapScreen must be used within a <MapSceneProvider>');
  return ctx;
}

/**
 * Register a map screen's scene + overlay UI while it is focused. The screen
 * itself renders nothing (return `null`); its map is drawn by the shared
 * `MapStage` and its `overlay` is teleported into the overlay layer above the
 * map. Both are kept in sync as `scene`/`overlay` change, and released shortly
 * after blur (see `RELEASE_DELAY_MS`).
 */
export function useMapScreen(scene: MapScene, overlay: ReactNode) {
  const { register, release } = useSceneControls();
  const key = scene.key;
  const focused = useRef(false);
  const latest = useRef({ scene, overlay });
  latest.current = { scene, overlay };

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      register(key, latest.current.scene, latest.current.overlay);
      return () => {
        focused.current = false;
        release(key);
      };
    }, [key, register, release]),
  );

  useEffect(() => {
    if (focused.current) register(key, scene, overlay);
  }, [scene, overlay, key, register]);
}
