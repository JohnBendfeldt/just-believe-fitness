import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bluetooth,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Flame,
  Gauge,
  GripVertical,
  History,
  LayoutGrid,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Rows3,
  Sliders,
  SlidersHorizontal,
  Square,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  ActiveSegmentSummary,
  AthleteProfile,
  GarminConfig,
  GarminImportedProfile,
  LiveTelemetry,
  SavedRide,
  SportMode,
  StravaConfig,
  TrackPoint,
  ZoneId,
} from './types/fitness';
import {
  computeNormalizedPower,
  computeWattsPerKg,
  cueDisplayLabel,
  estimateDistanceEtaSec,
  estimateIndoorSpeedMps,
  estimateKcalPerSecond,
  estimateRowingKcalPerSecond,
  estimateRunningKcalPerSecond,
  estimateRunningPowerWatts,
  evaluateRideFtpResult,
  formatDistanceTarget,
  formatDistanceValue,
  formatDuration,
  formatHeightImperial,
  formatPaceSeconds,
  formatRowingSplit,
  formatRunningPacePerMile,
  getCadenceZones,
  getEffectiveRowFtpWatts,
  getEffectiveRunThresholdPaceSec,
  getHrZones,
  getPowerZones,
  getRowingStrokeRateZones,
  getRunningCadenceZones,
  getRunningSpeedZones,
  metersToMiles,
  mpsToMph,
  resolveHeadlineEffortZone,
  resolveZone,
  rowingSplitToSpeedMps,
  rowingWattsToSplitSecPer500m,
} from './utils/zones';
import {
  COCKPIT_TILE_META,
  SECONDARY_STAT_META,
  TOPBAR_ACTION_META,
  TRANSPORT_CONTROL_META,
  createDefaultLayoutPrefs,
  getFocusTileOrder,
  getPrimaryGaugeOrder,
  getQuadStatOrder,
  isDefaultLayoutPrefs,
  moveOrderItem,
  moveOrderItemWithinSubset,
  reorderOrderItem,
  type CockpitTileId,
  type LayoutPreferences,
  type SecondaryStatId,
  type TopbarActionId,
  type TransportControlId,
} from './utils/layoutPrefs';
import {
  calculateEchelonWatts,
  suggestBikeResistance,
} from './services/ble/echelonPowerCurve';
import { EchelonBikeConnection } from './services/ble/echelonBle';
import { GarminHeartRateConnection } from './services/ble/garminHrBle';
import {
  formatWorkoutOptionLabel,
  getDistanceStageIndex,
  getSegmentTargetsForAthlete,
  getTotalWorkoutDistanceMeters,
  getWorkoutsForSport,
  groupWorkoutTemplates,
  isDistanceWorkout,
} from './data/workouts';
import {
  deleteSavedRide,
  listSavedRides,
  loadAthleteProfile,
  loadGarminConfig,
  loadLayoutPrefs,
  loadSportMode,
  loadStravaConfig,
  loadYouTubePresets,
  saveAthleteProfile,
  saveGarminConfig,
  saveLayoutPrefs,
  saveRideToDb,
  saveSportMode,
  saveStravaConfig,
  saveYouTubeState,
} from './services/storage';
import { downloadRideTcx } from './services/tcxExporter';
import {
  consumeAndVerifyStravaOAuthState,
  exchangeStravaOAuthCode,
  updateStravaActivityDetails,
  uploadRideToStrava,
} from './services/strava';
import {
  updateGarminActivityDetails,
  uploadRideToGarmin,
} from './services/garminConnect';
import { renderTelemetryHudCanvas } from './services/pipHud';
import { ScreenWakeManager, WorkoutAudioCue } from './services/wakeAndAudio';
import { getBluetoothUnsupportedMessage, isIosDevice } from './utils/browserSupport';
import { enterBrowserFullscreen, exitBrowserFullscreen } from './utils/fullscreen';
import { CockpitTile } from './components/CockpitTile';
import { FocusRideModal } from './components/FocusRideModal';
import { LiveZoneGraph } from './components/LiveZoneGraph';
import { YouTubeDeck, type YouTubeLayoutMode } from './components/YouTubeDeck';
import { AthleteProfileModal } from './components/AthleteProfileModal';
import { CustomizeLayoutModal } from './components/CustomizeLayoutModal';
import type { TileArrangeBinding } from './utils/tileArrange';
import {
  DeviceConnectionModal,
  HistoryAndStravaModal,
  type CloudUploadTarget,
} from './components/DeviceAndStravaModals';
import { LegalAndPrivacyModal } from './components/LegalAndPrivacyModal';
import {
  resolveLegalRouteFromPathname,
  type LegalDocTab,
} from './utils/legalRoutes';
import { checkRemoteBuildUpdate } from './utils/pwaUpdater';

const EMPTY_ZONE_SECONDS: Record<ZoneId, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const GAUGE_MODE_STORAGE_KEY = 'jbf_gauge_mode_v1';
const AUDIO_CUES_STORAGE_KEY = 'jbf_audio_cues_v1';
const GITHUB_REPO_URL = 'https://github.com/JohnBendfeldt/just-believe-fitness';
const AUTHOR_PORTFOLIO_URL = 'https://johnbendfeldt.com/';

function GitHubMarkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 0.5C5.37 0.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63 0.5 12 0.5Z" />
    </svg>
  );
}

export type GaugeDisplayMode = 'rings' | 'bars';

function loadGaugeDisplayMode(): GaugeDisplayMode {
  try {
    const saved = window.localStorage.getItem(GAUGE_MODE_STORAGE_KEY);
    return saved === 'bars' ? 'bars' : 'rings';
  } catch {
    return 'rings';
  }
}

function loadAudioCuesEnabled(): boolean {
  try {
    return window.localStorage.getItem(AUDIO_CUES_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function resolvePrimaryEffortZone(
  tel: LiveTelemetry,
  profile: AthleteProfile,
  sport: SportMode
): ZoneId {
  if (sport === 'running') {
    const gradeAdjustedMph = tel.speedMph * (1 + Math.max(0, tel.inclinePct ?? 0) * 0.045);
    return resolveZone(
      gradeAdjustedMph,
      getRunningSpeedZones(getEffectiveRunThresholdPaceSec(profile))
    ).zone;
  }
  const effFtp = sport === 'rowing' ? getEffectiveRowFtpWatts(profile) : profile.ftpWatts;
  return resolveZone(tel.powerWatts, getPowerZones(effFtp)).zone;
}

export function App() {
  // Athlete Profile (safe starter defaults: Rider, 5'8", 165 lbs, 150W FTP, 180 Max HR)
  const [profile, setProfile] = useState<AthleteProfile>(() => loadAthleteProfile());
  const profileRef = useRef<AthleteProfile>(profile);

  // Active Sport Modality ('cycling' | 'running' | 'rowing')
  const [sportMode, setSportMode] = useState<SportMode>(() => loadSportMode());
  const sportModeRef = useRef<SportMode>(sportMode);

  // Gauge Layout Mode ('rings' 2/3-col speedometer grid vs 'bars' horizontal Garmin bars)
  const [gaugeMode, setGaugeMode] = useState<GaugeDisplayMode>(() => loadGaugeDisplayMode());

  // Workout Selection & Active Session State
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string>(
    () => getWorkoutsForSport(loadSportMode())[0].id
  );
  const [rideState, setRideState] = useState<'idle' | 'running' | 'paused'>('idle');
  const rideStateRef = useRef<'idle' | 'running' | 'paused'>('idle');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const elapsedSecRef = useRef<number>(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number>(0);
  const distanceMetersRef = useRef<number>(0);
  const [caloriesKcal, setCaloriesKcal] = useState<number>(0);
  const [hrZoneSeconds, setHrZoneSeconds] = useState<Record<ZoneId, number>>({
    ...EMPTY_ZONE_SECONDS,
  });
  const [powerZoneSeconds, setPowerZoneSeconds] = useState<Record<ZoneId, number>>({
    ...EMPTY_ZONE_SECONDS,
  });
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [previewPoints, setPreviewPoints] = useState<TrackPoint[]>([]);
  const [segmentOffsetSec, setSegmentOffsetSec] = useState<number>(0);

  // Live Telemetry State
  const [telemetry, setTelemetry] = useState<LiveTelemetry>(() => ({
    sport: loadSportMode(),
    powerWatts: 0,
    cadenceRpm: 0,
    resistance: 18,
    inclinePct: 0,
    paceSecPer500m: 0,
    strokeCount: 0,
    heartRateBpm: 0,
    speedMph: 0,
    distanceMeters: 0,
    bikeConnected: false,
    bikeName: null,
    bikeStatus: 'disconnected',
    hrConnected: false,
    hrName: null,
    hrStatus: 'disconnected',
    isSimulating: false,
  }));
  const telemetryRef = useRef<LiveTelemetry>(telemetry);

  // Simulator Controls (Bike, Treadmill, Rower)
  const [simResistance, setSimResistance] = useState<number>(18);
  const [simCadence, setSimCadence] = useState<number>(85);
  const [simRunSpeedMph, setSimRunSpeedMph] = useState<number>(6.2);
  const [simRunInclinePct, setSimRunInclinePct] = useState<number>(1.0);
  const [simRowWatts, setSimRowWatts] = useState<number>(165);
  const [simRowStrokeRate, setSimRowStrokeRate] = useState<number>(24);
  const [simRowDamper, setSimRowDamper] = useState<number>(5);
  const simRowStrokesRef = useRef<number>(0);
  const simCurrentHrRef = useRef<number>(122);

  // YouTube & PiP State
  const initialYt = useMemo(() => loadYouTubePresets(), []);
  const [ytLayoutMode, setYtLayoutMode] = useState<YouTubeLayoutMode>('closed');
  const [ytUrl, setYtUrl] = useState<string>(initialYt.lastUrl);
  const [ytPresets, setYtPresets] = useState(initialYt.presets);
  const [isHudPipActive, setIsHudPipActive] = useState<boolean>(false);

  // Layout Personalization (Tiles, Ride Stats, Topbar Icons & Workout Controls)
  const [layoutPrefs, setLayoutPrefs] = useState<LayoutPreferences>(() => loadLayoutPrefs());
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState<boolean>(false);
  const [isArrangingLayout, setIsArrangingLayout] = useState<boolean>(false);
  const [draggedTileId, setDraggedTileId] = useState<CockpitTileId | null>(null);
  const [dragOverTileId, setDragOverTileId] = useState<CockpitTileId | null>(null);
  const [draggedControl, setDraggedControl] = useState<{
    group: 'topbar' | 'transport' | 'stat';
    id: string;
  } | null>(null);
  const [dragOverControl, setDragOverControl] = useState<{
    group: 'topbar' | 'transport' | 'stat';
    id: string;
  } | null>(null);
  const [viewportDims, setViewportDims] = useState<{ width: number; height: number }>(() =>
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1280, height: 800 }
  );

  const handleUpdateLayoutPrefs = useCallback((next: LayoutPreferences) => {
    setLayoutPrefs(next);
    saveLayoutPrefs(next);
  }, []);

  const primaryGaugeOrder = useMemo(
    () => getPrimaryGaugeOrder(layoutPrefs.tileOrder),
    [layoutPrefs.tileOrder]
  );
  const focusTileOrder = useMemo(
    () => getFocusTileOrder(layoutPrefs.tileOrder),
    [layoutPrefs.tileOrder]
  );
  const quadStatOrder = useMemo(
    () => getQuadStatOrder(layoutPrefs.secondaryStatOrder),
    [layoutPrefs.secondaryStatOrder]
  );

  useEffect(() => {
    if (!isArrangingLayout) return;
    const syncViewport = () => {
      setViewportDims({ width: window.innerWidth, height: window.innerHeight });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLayoutModalOpen) {
        setIsArrangingLayout(false);
      }
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isArrangingLayout, isLayoutModalOpen]);

  // Modals, History, Cloud Sync, Legal/Privacy Route, Audio, Toast
  const [bleBannerDismissed, setBleBannerDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('jbf-ble-banner-dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [isFocusModalOpen, setIsFocusModalOpen] = useState<boolean>(false);
  const [isAthleteModalOpen, setIsAthleteModalOpen] = useState<boolean>(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [legalDocTab, setLegalDocTab] = useState<LegalDocTab | null>(() =>
    typeof window !== 'undefined' ? resolveLegalRouteFromPathname(window.location.pathname) : null
  );
  const [highlightedRide, setHighlightedRide] = useState<SavedRide | null>(null);
  const [savedRides, setSavedRides] = useState<SavedRide[]>([]);
  const [stravaConfig, setStravaConfig] = useState<StravaConfig>(() => loadStravaConfig());
  const [garminConfig, setGarminConfig] = useState<GarminConfig>(() => loadGarminConfig());
  const [uploadingRideId, setUploadingRideId] = useState<string | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => loadAudioCuesEnabled());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [stopConfirmAction, setStopConfirmAction] = useState<'save' | 'discard' | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const wasRunningBeforeConfirmRef = useRef<boolean>(false);
  const isIdleForAutoReloadRef = useRef<boolean>(true);

  // Service Refs
  const bikeBleRef = useRef<EchelonBikeConnection | null>(null);
  const hrBleRef = useRef<GarminHeartRateConnection | null>(null);
  const wakeRef = useRef<ScreenWakeManager | null>(null);
  const audioRef = useRef<WorkoutAudioCue | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudVideoRef = useRef<HTMLVideoElement | null>(null);
  const hudStreamAttachedRef = useRef<boolean>(false);
  const lastAnnouncedBurnRef = useRef<number>(0);

  useEffect(() => {
    isIdleForAutoReloadRef.current =
      rideState === 'idle' &&
      elapsedSec === 0 &&
      uploadingRideId === null &&
      !isHistoryModalOpen &&
      !isAthleteModalOpen &&
      !isDeviceModalOpen &&
      !isLayoutModalOpen &&
      !isArrangingLayout;
  }, [
    rideState,
    elapsedSec,
    uploadingRideId,
    isHistoryModalOpen,
    isAthleteModalOpen,
    isDeviceModalOpen,
    isLayoutModalOpen,
    isArrangingLayout,
  ]);

  useEffect(() => {
    const currentBuildId = typeof __JBF_BUILD_ID__ !== 'undefined' ? __JBF_BUILD_ID__ : '';
    if (!currentBuildId) return;

    const verifyLatestVersion = async () => {
      if (document.visibilityState === 'hidden') return;
      const hasNewDeploy = await checkRemoteBuildUpdate(currentBuildId);
      if (!hasNewDeploy) return;
      if (isIdleForAutoReloadRef.current) {
        window.location.reload();
      } else {
        setUpdateAvailable(true);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void verifyLatestVersion();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    const intervalId = window.setInterval(() => void verifyLatestVersion(), 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setLegalDocTab(resolveLegalRouteFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleOpenLegalDoc = useCallback((tab: LegalDocTab) => {
    setLegalDocTab(tab);
    const targetPath = tab === 'privacy' ? '/privacy' : '/terms';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', `${targetPath}${window.location.search}`);
    }
  }, []);

  const handleCloseLegalDoc = useCallback(() => {
    setLegalDocTab(null);
    if (resolveLegalRouteFromPathname(window.location.pathname) !== null) {
      window.history.pushState({}, '', `/${window.location.search}`);
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 4200);
  }, []);

  const handleSelectGaugeMode = (nextMode: GaugeDisplayMode) => {
    setGaugeMode(nextMode);
    try {
      window.localStorage.setItem(GAUGE_MODE_STORAGE_KEY, nextMode);
    } catch {
      // Ignore storage quota errors
    }
  };

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  useEffect(() => {
    sportModeRef.current = sportMode;
  }, [sportMode]);

  useEffect(() => {
    rideStateRef.current = rideState;
  }, [rideState]);

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  const handleSelectSportMode = useCallback(
    (nextSport: SportMode, options?: { fromDevice?: boolean }) => {
      if (!options?.fromDevice && nextSport === sportModeRef.current) return;
      if (!options?.fromDevice && (rideStateRef.current !== 'idle' || elapsedSecRef.current > 0)) {
        showToast('Finish or discard your active workout before switching sport mode.');
        return;
      }

      sportModeRef.current = nextSport;
      setSportMode(nextSport);
      saveSportMode(nextSport);

      if (rideStateRef.current === 'idle' && elapsedSecRef.current === 0) {
        const nextWorkouts = getWorkoutsForSport(nextSport);
        setSelectedWorkoutId(nextWorkouts[0].id);
        setSegmentOffsetSec(0);
      }

      setPreviewPoints([]);
      simRowStrokesRef.current = 0;
      setTelemetry((prev) => ({
        ...prev,
        sport: nextSport,
        ...(!prev.bikeConnected && !prev.isSimulating
          ? {
              powerWatts: 0,
              cadenceRpm: 0,
              speedMph: 0,
              inclinePct: 0,
              paceSecPer500m: 0,
              strokeCount: 0,
            }
          : {}),
      }));
    },
    [showToast]
  );

  // Initialize WakeLock, Audio, IndexedDB Rides, and Strava OAuth Redirect Check
  useEffect(() => {
    wakeRef.current = new ScreenWakeManager();
    audioRef.current = new WorkoutAudioCue();

    void listSavedRides().then(setSavedRides).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get('code');
    const oauthState = params.get('state');
    if (oauthCode && consumeAndVerifyStravaOAuthState(oauthState)) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const currentCfg = loadStravaConfig();
      void exchangeStravaOAuthCode(oauthCode, currentCfg)
        .then(({ updatedConfig, importedFtp }) => {
          setStravaConfig(updatedConfig);
          if (importedFtp && importedFtp !== profileRef.current.ftpWatts) {
            showToast(
              `Strava connected as ${updatedConfig.athleteName}! (Strava FTP: ${importedFtp}W)`
            );
          } else {
            showToast(`Strava connected as ${updatedConfig.athleteName}!`);
          }
          setIsHistoryModalOpen(true);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Strava authorization failed.';
          showToast(message);
        });
    }
  }, [showToast]);

  // Instantiate BLE Connection Managers
  useEffect(() => {
    const bikeConn = new EchelonBikeConnection({
      onReading: ({
        cadenceRpm,
        resistance,
        directWatts,
        maxResistance,
        sport: readingSport,
        directSpeedMps,
        inclinePct,
        paceSecPer500m,
        strokeCount,
        machineHeartRateBpm,
      }) => {
        const p = profileRef.current;
        const model = bikeConn.getModelProfile();
        const activeSport = readingSport ?? model?.sport ?? sportModeRef.current;

        if (activeSport === 'running') {
          const speedMps = typeof directSpeedMps === 'number' ? directSpeedMps : 0;
          const grade = typeof inclinePct === 'number' ? inclinePct : 0;
          const watts =
            typeof directWatts === 'number' && directWatts > 0
              ? Math.round(directWatts * p.wattGain)
              : estimateRunningPowerWatts(speedMps, grade, p.weightLbs);
          setTelemetry((prev) => ({
            ...prev,
            sport: 'running',
            cadenceRpm,
            resistance,
            inclinePct: grade,
            powerWatts: watts,
            speedMph: mpsToMph(speedMps),
            heartRateBpm:
              !prev.hrConnected && machineHeartRateBpm ? machineHeartRateBpm : prev.heartRateBpm,
          }));
          return;
        }

        if (activeSport === 'rowing') {
          const watts = typeof directWatts === 'number' ? Math.round(directWatts * p.wattGain) : 0;
          const splitSec =
            typeof paceSecPer500m === 'number' && paceSecPer500m > 0
              ? paceSecPer500m
              : watts > 3
                ? rowingWattsToSplitSecPer500m(watts)
                : 0;
          const speedMps =
            typeof directSpeedMps === 'number' && directSpeedMps > 0
              ? directSpeedMps
              : splitSec > 0
                ? rowingSplitToSpeedMps(splitSec)
                : 0;
          setTelemetry((prev) => ({
            ...prev,
            sport: 'rowing',
            cadenceRpm,
            resistance,
            paceSecPer500m: splitSec,
            strokeCount: typeof strokeCount === 'number' ? strokeCount : prev.strokeCount,
            powerWatts: watts,
            speedMph: mpsToMph(speedMps),
            bikeMaxResistance: maxResistance ?? prev.bikeMaxResistance ?? 10,
            heartRateBpm:
              !prev.hrConnected && machineHeartRateBpm ? machineHeartRateBpm : prev.heartRateBpm,
          }));
          return;
        }

        const watts =
          typeof directWatts === 'number'
            ? Math.round(directWatts * p.wattGain)
            : calculateEchelonWatts(
                resistance,
                cadenceRpm,
                p.powerCurve,
                p.wattGain,
                model?.family,
                maxResistance ?? 32
              );
        const speedMps = estimateIndoorSpeedMps(watts, p);
        setTelemetry((prev) => ({
          ...prev,
          sport: 'cycling',
          cadenceRpm,
          resistance,
          powerWatts: watts,
          speedMph: mpsToMph(speedMps),
          bikeMaxResistance: maxResistance ?? prev.bikeMaxResistance ?? 32,
          heartRateBpm:
            !prev.hrConnected && machineHeartRateBpm ? machineHeartRateBpm : prev.heartRateBpm,
        }));
      },
      onStatusChange: (status, deviceName, message, modelProfile, unlockStatus) => {
        const connectedSport = status === 'connected' ? modelProfile?.sport : undefined;
        let autoSwitchedMsg = message;
        if (connectedSport && connectedSport !== sportModeRef.current) {
          handleSelectSportMode(connectedSport, { fromDevice: true });
          const sportLabel =
            connectedSport === 'running'
              ? 'Running'
              : connectedSport === 'rowing'
                ? 'Rowing'
                : 'Cycling';
          autoSwitchedMsg = message
            ? `${message} Switched to ${sportLabel} mode.`
            : `Connected — switched to ${sportLabel} mode.`;
        }
        setTelemetry((prev) => ({
          ...prev,
          sport: connectedSport ?? prev.sport ?? sportModeRef.current,
          bikeStatus: status,
          bikeConnected: status === 'connected',
          bikeName: deviceName,
          bikeUnlockStatus: status === 'connected' ? (unlockStatus ?? 'idle') : 'idle',
          bikeFamily: modelProfile?.family ?? null,
          bikeShortLabel: modelProfile?.shortLabel ?? null,
          bikeHasMotorizedResistance: modelProfile?.hasMotorizedResistance ?? false,
          bikeHasMotorizedSpeed: modelProfile?.hasMotorizedSpeed ?? false,
          bikeHasMotorizedIncline: modelProfile?.hasMotorizedIncline ?? false,
          bikeMaxResistance:
            status === 'connected'
              ? prev.bikeMaxResistance ?? (connectedSport === 'rowing' ? 10 : 32)
              : 32,
          isSimulating: status === 'connected' ? false : prev.isSimulating,
        }));
        if (autoSwitchedMsg) showToast(autoSwitchedMsg);
      },
    });

    const hrConn = new GarminHeartRateConnection({
      onHeartRate: (bpm) => {
        setTelemetry((prev) => ({
          ...prev,
          heartRateBpm: bpm,
        }));
      },
      onStatusChange: (status, deviceName, message) => {
        setTelemetry((prev) => ({
          ...prev,
          hrStatus: status,
          hrConnected: status === 'connected',
          hrName: deviceName,
        }));
        if (message) showToast(message);
      },
    });

    bikeBleRef.current = bikeConn;
    hrBleRef.current = hrConn;

    return () => {
      bikeConn.disconnect();
      hrConn.disconnect();
    };
  }, [showToast, handleSelectSportMode]);

  // Re-orient live Watts & Speed immediately whenever Athlete Profile changes
  const handleUpdateProfile = useCallback((next: AthleteProfile) => {
    setProfile(next);
    saveAthleteProfile(next);
    setTelemetry((prev) => {
      if (prev.sport === 'running') {
        if (prev.speedMph <= 0.1) return prev;
        const speedMps = prev.speedMph / 2.23693629;
        return {
          ...prev,
          powerWatts: estimateRunningPowerWatts(speedMps, prev.inclinePct ?? 0, next.weightLbs),
        };
      }
      if (prev.sport === 'rowing') {
        return prev;
      }
      if (prev.cadenceRpm <= 0 && prev.powerWatts <= 0) return prev;
      if (prev.bikeConnected && prev.bikeFamily === 'power-meter-bike') {
        const speedMps = estimateIndoorSpeedMps(prev.powerWatts, next);
        return { ...prev, speedMph: mpsToMph(speedMps) };
      }
      const watts = calculateEchelonWatts(
        prev.resistance,
        prev.cadenceRpm,
        next.powerCurve,
        next.wattGain,
        prev.bikeFamily,
        prev.bikeMaxResistance ?? 32
      );
      const speedMps = estimateIndoorSpeedMps(watts, next);
      return {
        ...prev,
        powerWatts: watts,
        speedMph: mpsToMph(speedMps),
      };
    });
  }, []);

  const handleOpenFocusMode = useCallback(() => {
    setIsFocusModalOpen(true);
    void enterBrowserFullscreen();
  }, []);

  const handleCloseFocusMode = useCallback(() => {
    setIsFocusModalOpen(false);
    void exitBrowserFullscreen();
  }, []);

  // Keep Screen Wake Lock engaged while running or viewing full-screen Focus Mode
  useEffect(() => {
    void wakeRef.current?.setActive(rideState === 'running' || isFocusModalOpen);
  }, [rideState, isFocusModalOpen]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.enabled = audioEnabled;
    }
    try {
      window.localStorage.setItem(AUDIO_CUES_STORAGE_KEY, audioEnabled ? 'true' : 'false');
    } catch {
      // Ignore storage quota errors
    }
  }, [audioEnabled]);

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.enabled = next;
        if (next) {
          audioRef.current.unlock();
        }
      }
      return next;
    });
  }, []);

  // Selected Workout & Active Segment Resolution
  const activeWorkouts = useMemo(() => getWorkoutsForSport(sportMode), [sportMode]);
  const selectedWorkout = useMemo(
    () => activeWorkouts.find((w) => w.id === selectedWorkoutId) ?? activeWorkouts[0],
    [activeWorkouts, selectedWorkoutId]
  );

  const activeSegmentInfo: ActiveSegmentSummary | null = (() => {
    if (selectedWorkout.isFreeRide || selectedWorkout.segments.length === 0) {
      return null;
    }

    if (isDistanceWorkout(selectedWorkout)) {
      const totalTargetMeters = getTotalWorkoutDistanceMeters(selectedWorkout);
      const unit = selectedWorkout.distanceUnit ?? (sportMode === 'rowing' ? 'm' : 'mi');
      const totalRemainingMeters = Math.max(0, totalTargetMeters - distanceMeters);
      const overallProgressPct = Math.min(
        100,
        Math.max(0, (distanceMeters / Math.max(1, totalTargetMeters)) * 100)
      );
      const isGoalComplete = distanceMeters >= totalTargetMeters;
      const currentSpeedMps = telemetry.speedMph / 2.23693629;
      const avgSpeedMps = elapsedSec > 0 ? distanceMeters / elapsedSec : 0;
      const etaRemainingSec = estimateDistanceEtaSec(
        totalRemainingMeters,
        currentSpeedMps,
        avgSpeedMps
      );

      let cursorMeters = 0;
      for (let i = 0; i < selectedWorkout.segments.length; i++) {
        const seg = selectedWorkout.segments[i];
        const segDist = seg.distanceMeters ?? 0;
        if (distanceMeters < cursorMeters + segDist) {
          const stageElapsedMeters = Math.max(0, distanceMeters - cursorMeters);
          const stageRemainingMeters = Math.max(0, segDist - stageElapsedMeters);
          const stageProgressPct =
            segDist > 0 ? Math.min(100, Math.max(0, (stageElapsedMeters / segDist) * 100)) : 100;
          const nextSeg = selectedWorkout.segments[i + 1] ?? null;
          return {
            index: i,
            totalSegments: selectedWorkout.segments.length,
            segment: seg,
            remainingSec: 0,
            distanceMode: {
              unit,
              totalTargetMeters,
              totalRemainingMeters,
              overallProgressPct,
              stageTargetMeters: segDist,
              stageRemainingMeters,
              stageProgressPct,
              etaRemainingSec,
              isGoalComplete,
            },
            nextSegment: nextSeg,
            targets: getSegmentTargetsForAthlete(seg, profile, telemetry.bikeFamily, sportMode),
          };
        }
        cursorMeters += segDist;
      }

      const lastSeg = selectedWorkout.segments[selectedWorkout.segments.length - 1];
      const lastSegDist = lastSeg.distanceMeters ?? 0;
      return {
        index: selectedWorkout.segments.length - 1,
        totalSegments: selectedWorkout.segments.length,
        segment: lastSeg,
        remainingSec: 0,
        distanceMode: {
          unit,
          totalTargetMeters,
          totalRemainingMeters: 0,
          overallProgressPct: 100,
          stageTargetMeters: lastSegDist,
          stageRemainingMeters: 0,
          stageProgressPct: 100,
          etaRemainingSec: 0,
          isGoalComplete: true,
        },
        nextSegment: null,
        targets: getSegmentTargetsForAthlete(lastSeg, profile, telemetry.bikeFamily, sportMode),
      };
    }

    const virtualClock = elapsedSec + segmentOffsetSec;
    let cursor = 0;
    for (let i = 0; i < selectedWorkout.segments.length; i++) {
      const seg = selectedWorkout.segments[i];
      if (virtualClock < cursor + seg.durationSec) {
        const segElapsed = virtualClock - cursor;
        const remainingSec = seg.durationSec - segElapsed;
        const nextSeg = selectedWorkout.segments[i + 1] ?? null;
        return {
          index: i,
          totalSegments: selectedWorkout.segments.length,
          segment: seg,
          remainingSec,
          nextSegment: nextSeg,
          targets: getSegmentTargetsForAthlete(seg, profile, telemetry.bikeFamily, sportMode),
        };
      }
      cursor += seg.durationSec;
    }
    const lastSeg = selectedWorkout.segments[selectedWorkout.segments.length - 1];
    return {
      index: selectedWorkout.segments.length - 1,
      totalSegments: selectedWorkout.segments.length,
      segment: lastSeg,
      remainingSec: 0,
      nextSegment: null,
      targets: getSegmentTargetsForAthlete(lastSeg, profile, telemetry.bikeFamily, sportMode),
    };
  })();

  // Interactive Multi-Sport Studio Simulator Loop (updates every 1s when enabled)
  useEffect(() => {
    if (!telemetry.isSimulating) return;

    const tickSim = () => {
      const p = profileRef.current;

      const stepHr = (intensityRatio: number): number => {
        const targetHr = Math.min(
          p.maxHrBpm,
          Math.max(
            p.restingHrBpm + 24,
            Math.round(p.maxHrBpm * (0.52 + 0.37 * intensityRatio))
          )
        );
        const currentHr = simCurrentHrRef.current;
        const nextHr = Math.round(
          currentHr + (targetHr - currentHr) * 0.14 + (Math.random() - 0.5) * 1.4
        );
        simCurrentHrRef.current = nextHr;
        return nextHr;
      };

      if (sportMode === 'running') {
        const speedMph = Math.max(
          1.5,
          Math.min(15, Math.round((simRunSpeedMph + (Math.random() - 0.5) * 0.08) * 10) / 10)
        );
        const speedMps = speedMph / 2.23693629;
        const watts = estimateRunningPowerWatts(speedMps, simRunInclinePct, p.weightLbs);
        const baseSpm =
          speedMph < 4.2 ? 110 + speedMph * 8 : 146 + (speedMph - 4.2) * 6.5;
        const cadenceSpm = Math.round(
          Math.max(95, Math.min(202, baseSpm + (Math.random() - 0.5) * 3))
        );
        const thresholdMph = 3600 / getEffectiveRunThresholdPaceSec(p);
        const gradeAdjMph = speedMph * (1 + Math.max(0, simRunInclinePct) * 0.045);
        const nextHr = stepHr(gradeAdjMph / Math.max(3.5, thresholdMph));

        setTelemetry((prev) => ({
          ...prev,
          sport: 'running',
          cadenceRpm: cadenceSpm,
          inclinePct: simRunInclinePct,
          resistance: Math.round(simRunInclinePct * 2),
          powerWatts: watts,
          speedMph,
          heartRateBpm: prev.hrConnected ? prev.heartRateBpm : nextHr,
        }));
        return;
      }

      if (sportMode === 'rowing') {
        const watts = Math.max(30, Math.round(simRowWatts + (Math.random() - 0.5) * 6));
        const spm = Math.max(
          14,
          Math.min(44, Math.round(simRowStrokeRate + (Math.random() - 0.5) * 1.2))
        );
        const splitSec = rowingWattsToSplitSecPer500m(watts);
        const speedMps = rowingSplitToSpeedMps(splitSec);
        simRowStrokesRef.current += spm / 60;
        const rowFtp = getEffectiveRowFtpWatts(p);
        const nextHr = stepHr(watts / Math.max(80, rowFtp));

        setTelemetry((prev) => ({
          ...prev,
          sport: 'rowing',
          cadenceRpm: spm,
          resistance: simRowDamper,
          paceSecPer500m: splitSec,
          strokeCount: Math.floor(simRowStrokesRef.current),
          powerWatts: watts,
          speedMph: mpsToMph(speedMps),
          bikeMaxResistance: 10,
          heartRateBpm: prev.hrConnected ? prev.heartRateBpm : nextHr,
        }));
        return;
      }

      const jitter = Math.round((Math.random() - 0.5) * 3);
      const cadence = Math.max(40, simCadence + jitter);
      const watts = calculateEchelonWatts(simResistance, cadence, p.powerCurve, p.wattGain);
      const speedMps = estimateIndoorSpeedMps(watts, p);
      const nextHr = stepHr(watts / Math.max(80, p.ftpWatts));

      setTelemetry((prev) => ({
        ...prev,
        sport: 'cycling',
        cadenceRpm: cadence,
        resistance: simResistance,
        powerWatts: watts,
        speedMph: mpsToMph(speedMps),
        heartRateBpm: prev.hrConnected ? prev.heartRateBpm : nextHr,
      }));
    };

    tickSim();
    const id = window.setInterval(tickSim, 1000);
    return () => window.clearInterval(id);
  }, [
    telemetry.isSimulating,
    sportMode,
    simResistance,
    simCadence,
    simRunSpeedMph,
    simRunInclinePct,
    simRowWatts,
    simRowStrokeRate,
    simRowDamper,
  ]);

  // When the simulator is switched off, clear the values it was feeding so gauges, stats and
  // the timeline don't stay frozen on the last simulated reading. Real sensors are left alone.
  const wasSimulatingRef = useRef(false);
  useEffect(() => {
    if (wasSimulatingRef.current && !telemetry.isSimulating) {
      setTelemetry((prev) => ({
        ...prev,
        powerWatts: prev.bikeConnected ? prev.powerWatts : 0,
        cadenceRpm: prev.bikeConnected ? prev.cadenceRpm : 0,
        speedMph: prev.bikeConnected ? prev.speedMph : 0,
        inclinePct: prev.bikeConnected ? prev.inclinePct : 0,
        paceSecPer500m: prev.bikeConnected ? prev.paceSecPer500m : 0,
        heartRateBpm: prev.hrConnected ? prev.heartRateBpm : 0,
      }));
      simCurrentHrRef.current = profileRef.current.restingHrBpm + 24;
    }
    wasSimulatingRef.current = telemetry.isSimulating;
  }, [telemetry.isSimulating]);

  // Pre-ride preview: while idle, stream live/simulated readings into a rolling buffer so the
  // timeline reacts to Simulate or a paired machine before Start. Never saved or counted in stats.
  useEffect(() => {
    if (
      rideState !== 'idle' ||
      (!telemetry.isSimulating && !telemetry.bikeConnected && !telemetry.hrConnected)
    ) {
      return;
    }
    const sessionStartMs = Date.now();
    const timer = window.setInterval(() => {
      const t = telemetryRef.current;
      const p = profileRef.current;
      const activeSport = t.sport ?? sportModeRef.current;
      if (t.powerWatts <= 0 && t.speedMph <= 0.1 && t.heartRateBpm <= 0) return;
      const point: TrackPoint = {
        timestampMs: Date.now(),
        elapsedSec: 0,
        powerWatts: t.powerWatts,
        cadenceRpm: t.cadenceRpm,
        resistance: t.resistance,
        ...(activeSport === 'running' ? { inclinePct: t.inclinePct ?? 0 } : {}),
        ...(activeSport === 'rowing' && t.paceSecPer500m ? { paceSecPer500m: t.paceSecPer500m } : {}),
        heartRateBpm: t.heartRateBpm,
        speedMps: 0,
        distanceMeters: 0,
        caloriesKcal: 0,
        hrZone: resolveZone(t.heartRateBpm, getHrZones(p.maxHrBpm)).zone,
        powerZone: resolvePrimaryEffortZone(t, p, activeSport),
      };
      setPreviewPoints((prev) => [
        ...prev.filter((pt) => pt.timestampMs >= sessionStartMs).slice(-239),
        point,
      ]);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rideState, telemetry.isSimulating, telemetry.bikeConnected, telemetry.hrConnected]);

  // 1-Second Active Workout Recording & Interval / Distance Stage Cue Loop
  useEffect(() => {
    if (rideState !== 'running') return;

    const timer = window.setInterval(() => {
      const currTel = telemetryRef.current;
      const currProf = profileRef.current;
      const activeSport = currTel.sport ?? sportModeRef.current;
      const hrZ = resolveZone(currTel.heartRateBpm, getHrZones(currProf.maxHrBpm)).zone;
      const pwrZ = resolvePrimaryEffortZone(currTel, currProf, activeSport);

      const speedMps =
        activeSport === 'running' || activeSport === 'rowing'
          ? Math.max(0, currTel.speedMph / 2.23693629)
          : estimateIndoorSpeedMps(currTel.powerWatts, currProf);
      const kcalDelta =
        activeSport === 'running'
          ? estimateRunningKcalPerSecond(
              speedMps,
              currTel.inclinePct ?? 0,
              currTel.heartRateBpm,
              currProf
            )
          : activeSport === 'rowing'
            ? estimateRowingKcalPerSecond(currTel.powerWatts, currTel.heartRateBpm, currProf)
            : estimateKcalPerSecond(currTel.powerWatts, currTel.heartRateBpm, currProf);

      const prevDist = distanceMetersRef.current;
      const nextDist = prevDist + speedMps;
      distanceMetersRef.current = nextDist;

      // Distance-driven challenge transitions, milestone toasts (25/50/75%), and finish celebration
      if (isDistanceWorkout(selectedWorkout) && selectedWorkout.segments.length > 0) {
        const totalTarget = getTotalWorkoutDistanceMeters(selectedWorkout);
        const unit = selectedWorkout.distanceUnit ?? (activeSport === 'rowing' ? 'm' : 'mi');
        const prevStage = getDistanceStageIndex(selectedWorkout, prevDist);
        const nextStage = getDistanceStageIndex(selectedWorkout, nextDist);

        if (nextStage > prevStage) {
          audioRef.current?.playTick(true);
          if (nextStage >= selectedWorkout.segments.length) {
            audioRef.current?.playCoachClip('workout-complete');
            showToast(
              `${selectedWorkout.name} complete (${formatDistanceTarget(totalTarget, unit)})! Ease into a cool-down or tap Stop & Save.`
            );
          } else {
            const nextSeg = selectedWorkout.segments[nextStage];
            audioRef.current?.playSegmentCue(nextSeg.id, nextSeg.cue);
          }
        }

        const prevPct = (prevDist / Math.max(1, totalTarget)) * 100;
        const nextPct = (nextDist / Math.max(1, totalTarget)) * 100;
        for (const milestone of [25, 50, 75] as const) {
          if (prevPct < milestone && nextPct >= milestone && nextDist < totalTarget) {
            const rem = formatDistanceValue(totalTarget - nextDist, unit);
            showToast(`${milestone}% of ${selectedWorkout.name} complete · ${rem} to go!`);
          }
        }
      }

      setElapsedSec((prevElapsed) => {
        const nextElapsed = prevElapsed + 1;

        // Play 10s heads-up, 3-2-1-GO chimes, and pre-rendered Coach Jenny MP3 prompts on timed interval transitions
        if (
          !selectedWorkout.isFreeRide &&
          !isDistanceWorkout(selectedWorkout) &&
          selectedWorkout.segments.length > 0
        ) {
          const vClock = nextElapsed + segmentOffsetSec;
          let acc = 0;
          for (let i = 0; i < selectedWorkout.segments.length; i++) {
            const seg = selectedWorkout.segments[i];
            acc += seg.durationSec;
            const diff = acc - vClock;
            if (diff === 10 && seg.durationSec >= 45 && i < selectedWorkout.segments.length - 1) {
              audioRef.current?.playCoachClip('ten-seconds');
            } else if (diff === 3 || diff === 2 || diff === 1) {
              audioRef.current?.playTick(false);
            } else if (diff === 0) {
              audioRef.current?.playTick(true);
              const nextSeg = selectedWorkout.segments[i + 1];
              if (nextSeg) {
                audioRef.current?.playSegmentCue(nextSeg.id, nextSeg.cue);
              } else {
                audioRef.current?.playCoachClip('workout-complete');
              }
            }
          }
        }

        setDistanceMeters(nextDist);
        setCaloriesKcal((prevCal) => {
          const nextCal = prevCal + kcalDelta;
          const point: TrackPoint = {
            timestampMs: Date.now(),
            elapsedSec: nextElapsed,
            powerWatts: currTel.powerWatts,
            cadenceRpm: currTel.cadenceRpm,
            resistance: currTel.resistance,
            ...(activeSport === 'running' ? { inclinePct: currTel.inclinePct ?? 0 } : {}),
            ...(activeSport === 'rowing' && currTel.paceSecPer500m
              ? { paceSecPer500m: currTel.paceSecPer500m }
              : {}),
            heartRateBpm: currTel.heartRateBpm,
            speedMps,
            distanceMeters: nextDist,
            caloriesKcal: nextCal,
            hrZone: hrZ,
            powerZone: pwrZ,
          };
          setTrackPoints((prevPts) => [...prevPts, point]);
          return nextCal;
        });

        if (currTel.heartRateBpm > 0) {
          setHrZoneSeconds((prev) => ({ ...prev, [hrZ]: prev[hrZ] + 1 }));
        }
        setPowerZoneSeconds((prev) => ({ ...prev, [pwrZ]: prev[pwrZ] + 1 }));

        return nextElapsed;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rideState, selectedWorkout, segmentOffsetSec, showToast]);

  // Derived Burn Points: 1 Burn Point per 60s spent in Orange/Red (Zone 4-5) by EITHER heart rate
  // OR power. Indoor riders often hit Orange/Red power while HR lags, so each second counts once
  // if either metric is in the burn zones.
  const hasHrStream = telemetry.heartRateBpm > 0 || hrZoneSeconds[4] + hrZoneSeconds[5] > 0;
  const burnZoneTotalSec = useMemo(
    () => trackPoints.filter((p) => p.hrZone >= 4 || p.powerZone >= 4).length,
    [trackPoints]
  );
  const burnPoints = Math.floor(burnZoneTotalSec / 60);

  // Announce 1st and 12th Burn Point milestones via pre-rendered Coach MP3s
  useEffect(() => {
    if (rideState !== 'running') return;
    if (burnPoints <= lastAnnouncedBurnRef.current) return;
    lastAnnouncedBurnRef.current = burnPoints;
    if (burnPoints === 1) {
      audioRef.current?.playCoachClip('burn-first');
    } else if (burnPoints === 12) {
      audioRef.current?.playCoachClip('burn-twelve');
    }
  }, [burnPoints, rideState]);

  const pipRemainingLabel = activeSegmentInfo?.distanceMode
    ? activeSegmentInfo.distanceMode.isGoalComplete
      ? 'GOAL DONE'
      : `${formatDistanceValue(
          activeSegmentInfo.distanceMode.totalRemainingMeters,
          activeSegmentInfo.distanceMode.unit
        ).toUpperCase()} LEFT`
    : undefined;

  const avgRideWatts = useMemo(() => {
    if (trackPoints.length === 0) return 0;
    return Math.round(
      trackPoints.reduce((acc, p) => acc + p.powerWatts, 0) / trackPoints.length
    );
  }, [trackPoints]);

  const npRideWatts = useMemo(
    () => computeNormalizedPower(trackPoints.map((p) => p.powerWatts)),
    [trackPoints]
  );

  // Keep Picture-in-Picture Canvas continuously updated
  useEffect(() => {
    const canvas = hudCanvasRef.current;
    if (!canvas) return;
    renderTelemetryHudCanvas(canvas, {
      telemetry,
      profile,
      elapsedSec,
      burnPoints,
      distanceMeters,
      caloriesKcal,
      avgRideWatts,
      npRideWatts,
      gaugeMode,
      primaryMetricOrder: primaryGaugeOrder,
      segmentLabel: activeSegmentInfo?.segment.label,
      segmentRemainingSec: activeSegmentInfo?.distanceMode
        ? undefined
        : activeSegmentInfo?.remainingSec,
      segmentRemainingLabel: pipRemainingLabel,
    });
  }, [
    telemetry,
    profile,
    elapsedSec,
    burnPoints,
    distanceMeters,
    caloriesKcal,
    avgRideWatts,
    npRideWatts,
    gaugeMode,
    primaryGaugeOrder,
    activeSegmentInfo,
    pipRemainingLabel,
  ]);

  // Launch Picture-in-Picture Floating HUD (works over YouTube App on Android/Desktop)
  const handleLaunchHudPip = useCallback(async () => {
    const canvas = hudCanvasRef.current;
    const video = hudVideoRef.current as
      | (HTMLVideoElement & {
          webkitPresentationMode?: string;
          webkitSupportsPresentationMode?: (mode: string) => boolean;
          webkitSetPresentationMode?: (mode: string) => void;
        })
      | null;
    if (!canvas || !video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsHudPipActive(false);
        return;
      }
      if (
        video.webkitPresentationMode === 'picture-in-picture' &&
        typeof video.webkitSetPresentationMode === 'function'
      ) {
        video.webkitSetPresentationMode('inline');
        setIsHudPipActive(false);
        return;
      }

      renderTelemetryHudCanvas(canvas, {
        telemetry: telemetryRef.current,
        profile: profileRef.current,
        elapsedSec,
        burnPoints,
        distanceMeters,
        caloriesKcal,
        avgRideWatts,
        npRideWatts,
        gaugeMode,
        primaryMetricOrder: primaryGaugeOrder,
        segmentLabel: activeSegmentInfo?.segment.label,
        segmentRemainingSec: activeSegmentInfo?.distanceMode
          ? undefined
          : activeSegmentInfo?.remainingSec,
        segmentRemainingLabel: pipRemainingLabel,
      });

      if (!hudStreamAttachedRef.current) {
        if (typeof canvas.captureStream !== 'function') {
          showToast(
            isIosDevice()
              ? 'iPhone/Bluefy blocks PiP pop-out for live gauges — use the built-in YouTube Split/Corner player so Bluetooth stays connected!'
              : 'Use the built-in YouTube Split/Corner player on this device.'
          );
          return;
        }
        const stream = canvas.captureStream(10);
        video.srcObject = stream;
        hudStreamAttachedRef.current = true;
      }

      await video.play();

      if ('requestPictureInPicture' in video && typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
        setIsHudPipActive(true);
        showToast('Telemetry HUD popped out! Open YouTube and ride along.');
      } else if (
        typeof video.webkitSetPresentationMode === 'function' &&
        video.webkitSupportsPresentationMode?.('picture-in-picture')
      ) {
        video.webkitSetPresentationMode('picture-in-picture');
        setIsHudPipActive(true);
        showToast('Telemetry HUD popped out! Note: keep this tab active if Bluetooth pauses on iOS.');
      } else {
        showToast(
          isIosDevice()
            ? 'iPhone/Bluefy blocks PiP pop-out for live gauges — use the built-in YouTube Split/Corner player right inside the app so Bluetooth stays connected!'
            : 'Use the built-in YouTube Split/Corner player on this device, or enable PiP in Chrome settings.'
        );
      }
    } catch (err: unknown) {
      const msg = isIosDevice()
        ? 'iPhone/Bluefy blocks system PiP pop-out for live canvas gauges — use the built-in YouTube Split/Corner player inside the app so Bluetooth stays live!'
        : err instanceof Error
          ? err.message
          : 'Could not open system PiP window — try the built-in YouTube Split/Corner player!';
      showToast(msg);
    }
  }, [
    elapsedSec,
    burnPoints,
    distanceMeters,
    caloriesKcal,
    avgRideWatts,
    npRideWatts,
    gaugeMode,
    primaryGaugeOrder,
    activeSegmentInfo,
    pipRemainingLabel,
    showToast,
  ]);

  useEffect(() => {
    const video = hudVideoRef.current as
      | (HTMLVideoElement & { webkitPresentationMode?: string })
      | null;
    if (!video) return;
    const onLeave = () => setIsHudPipActive(false);
    const onWebkitModeChange = () => {
      if (video.webkitPresentationMode !== 'picture-in-picture') {
        setIsHudPipActive(false);
      }
    };
    video.addEventListener('leavepictureinpicture', onLeave);
    video.addEventListener('webkitpresentationmodechanged', onWebkitModeChange);
    return () => {
      video.removeEventListener('leavepictureinpicture', onLeave);
      video.removeEventListener('webkitpresentationmodechanged', onWebkitModeChange);
    };
  }, []);

  // Workout Controls
  const handleStartOrResume = () => {
    audioRef.current?.unlock();
    if (rideState === 'idle') {
      lastAnnouncedBurnRef.current = 0;
      setPreviewPoints([]);
      setStartedAtMs(Date.now());
      if (!telemetry.bikeConnected && !telemetry.isSimulating) {
        setTelemetry((prev) => ({ ...prev, isSimulating: true }));
        showToast('Ride started with Demo Simulator active — pair your bike anytime!');
      }
      if (selectedWorkout.isFreeRide) {
        audioRef.current?.playCoachClip('free-ride-start');
      } else if (activeSegmentInfo) {
        audioRef.current?.playSegmentCue(
          activeSegmentInfo.segment.id,
          activeSegmentInfo.segment.cue
        );
      }
    }
    setRideState('running');
  };

  const handleSkipSegment = () => {
    if (!activeSegmentInfo || activeSegmentInfo.distanceMode) return;
    setSegmentOffsetSec((prev) => prev + activeSegmentInfo.remainingSec);
    if (rideState === 'running' && activeSegmentInfo.nextSegment) {
      audioRef.current?.playTick(true);
      audioRef.current?.playSegmentCue(
        activeSegmentInfo.nextSegment.id,
        activeSegmentInfo.nextSegment.cue
      );
    }
  };

  const handleResetWorkout = () => {
    setStopConfirmAction(null);
    wasRunningBeforeConfirmRef.current = false;
    audioRef.current?.stopVoice();
    lastAnnouncedBurnRef.current = 0;
    setRideState('idle');
    setElapsedSec(0);
    setSegmentOffsetSec(0);
    setStartedAtMs(null);
    distanceMetersRef.current = 0;
    setDistanceMeters(0);
    setCaloriesKcal(0);
    setHrZoneSeconds({ ...EMPTY_ZONE_SECONDS });
    setPowerZoneSeconds({ ...EMPTY_ZONE_SECONDS });
    setTrackPoints([]);
  };

  const requestStopWorkoutConfirmation = (action: 'save' | 'discard') => {
    if (elapsedSec < 5 || trackPoints.length === 0) {
      if (action === 'save') {
        handleResetWorkout();
        showToast('Ride was under 5 seconds — reset without saving.');
      } else {
        handleResetWorkout();
      }
      return;
    }
    wasRunningBeforeConfirmRef.current = rideState === 'running';
    if (rideState === 'running') {
      setRideState('paused');
    }
    setStopConfirmAction(action);
  };

  const handleCancelStopConfirm = () => {
    const shouldResume = wasRunningBeforeConfirmRef.current;
    wasRunningBeforeConfirmRef.current = false;
    setStopConfirmAction(null);
    if (shouldResume) {
      setRideState('running');
    }
  };

  const handleFinishAndSave = async () => {
    setStopConfirmAction(null);
    wasRunningBeforeConfirmRef.current = false;
    setIsFocusModalOpen(false);
    setRideState('idle');
    if (elapsedSec < 5 || trackPoints.length === 0) {
      handleResetWorkout();
      showToast('Workout was under 5 seconds — reset without saving.');
      return;
    }

    const wattsArr = trackPoints.map((p) => p.powerWatts);
    const cadArr = trackPoints.map((p) => p.cadenceRpm);
    const resArr = trackPoints.map((p) => p.resistance);
    const hrArr = trackPoints.map((p) => p.heartRateBpm).filter((h) => h > 0);
    const inclineArr = trackPoints
      .map((p) => p.inclinePct)
      .filter((v): v is number => typeof v === 'number');
    const splitArr = trackPoints
      .map((p) => p.paceSecPer500m)
      .filter((v): v is number => typeof v === 'number' && v > 30 && v < 600);

    const avgWatts = Math.round(wattsArr.reduce((a, b) => a + b, 0) / wattsArr.length);
    const maxWatts = Math.max(...wattsArr, 0);
    const normalizedWatts = computeNormalizedPower(wattsArr);
    const avgWkg = computeWattsPerKg(avgWatts, profile.weightLbs);
    const avgCadence = Math.round(cadArr.reduce((a, b) => a + b, 0) / cadArr.length);
    const maxCadence = Math.max(...cadArr, 0);
    const avgResistance = Math.round(resArr.reduce((a, b) => a + b, 0) / resArr.length);
    const avgHr = hrArr.length
      ? Math.round(hrArr.reduce((a, b) => a + b, 0) / hrArr.length)
      : 0;
    const maxHr = hrArr.length ? Math.max(...hrArr) : 0;

    const avgInclinePct =
      sportMode === 'running' && inclineArr.length > 0
        ? Math.round((inclineArr.reduce((a, b) => a + b, 0) / inclineArr.length) * 10) / 10
        : undefined;
    const maxInclinePct =
      sportMode === 'running' && inclineArr.length > 0
        ? Math.round(Math.max(...inclineArr) * 10) / 10
        : undefined;
    const avgSplitSecPer500m =
      sportMode === 'rowing'
        ? splitArr.length > 0
          ? Math.round(splitArr.reduce((a, b) => a + b, 0) / splitArr.length)
          : avgWatts > 3
            ? Math.round(rowingWattsToSplitSecPer500m(avgWatts))
            : undefined
        : undefined;
    const totalStrokes =
      sportMode === 'rowing' && telemetry.strokeCount && telemetry.strokeCount > 0
        ? Math.round(telemetry.strokeCount)
        : undefined;

    const fallbackMachineLabel =
      sportMode === 'running'
        ? 'Treadmill'
        : sportMode === 'rowing'
          ? 'FTMS Rower'
          : 'Indoor Bike';
    const bikeLabel = telemetry.bikeConnected
      ? bikeBleRef.current?.getModelProfile()?.displayName ||
        telemetry.bikeName ||
        fallbackMachineLabel
      : fallbackMachineLabel;

    const ftpTestResult =
      sportMode === 'cycling'
        ? evaluateRideFtpResult(wattsArr, profile.ftpWatts, Boolean(selectedWorkout.isFtpTest))
        : undefined;

    const ride: SavedRide = {
      id: `ride-${Date.now()}`,
      sport: sportMode,
      title: `${selectedWorkout.name}`,
      workoutName: selectedWorkout.name,
      bikeLabel,
      startedAtIso: new Date(startedAtMs ?? Date.now() - elapsedSec * 1000).toISOString(),
      endedAtIso: new Date().toISOString(),
      durationSec: elapsedSec,
      distanceMeters,
      caloriesKcal: Math.round(caloriesKcal),
      burnPoints,
      avgWatts,
      maxWatts,
      normalizedWatts,
      avgWkg,
      avgCadence,
      maxCadence,
      avgResistance,
      ...(avgInclinePct !== undefined ? { avgInclinePct } : {}),
      ...(maxInclinePct !== undefined ? { maxInclinePct } : {}),
      ...(avgSplitSecPer500m !== undefined ? { avgSplitSecPer500m } : {}),
      ...(totalStrokes !== undefined ? { totalStrokes } : {}),
      avgHr,
      maxHr,
      athleteSnapshot: { ...profile },
      hrZoneSeconds: { ...hrZoneSeconds },
      powerZoneSeconds: { ...powerZoneSeconds },
      trackPoints: [...trackPoints],
      ...(ftpTestResult ? { ftpTestResult } : {}),
    };

    await saveRideToDb(ride);
    const updatedList = await listSavedRides();
    setSavedRides(updatedList);
    setHighlightedRide(ride);
    setIsHistoryModalOpen(true);
    handleResetWorkout();
  };

  // Simulator Effort Preset Helpers (orients directly to Athlete's Bike FTP, Run Threshold, or Row FTP)
  const applySimulatorEffort = (ftpMultiplier: number, targetCadence: number) => {
    const desiredWatts = Math.round(profile.ftpWatts * ftpMultiplier);
    const recRes = suggestBikeResistance(
      desiredWatts,
      targetCadence,
      profile.powerCurve,
      profile.wattGain
    );
    setSimCadence(targetCadence);
    setSimResistance(recRes);
    if (!telemetry.isSimulating) {
      setTelemetry((prev) => ({ ...prev, isSimulating: true }));
    }
  };

  const applyRunSimulatorEffort = (thresholdMultiplier: number, inclinePct: number) => {
    const thresholdMph = 3600 / getEffectiveRunThresholdPaceSec(profile);
    const targetMph = Math.max(
      2.0,
      Math.min(14.0, Math.round(thresholdMph * thresholdMultiplier * 10) / 10)
    );
    setSimRunSpeedMph(targetMph);
    setSimRunInclinePct(inclinePct);
    if (!telemetry.isSimulating) {
      setTelemetry((prev) => ({ ...prev, sport: 'running', isSimulating: true }));
    }
  };

  const applyRowSimulatorEffort = (ftpMultiplier: number, targetStrokeRate: number) => {
    const rowFtp = getEffectiveRowFtpWatts(profile);
    const desiredWatts = Math.max(50, Math.min(480, Math.round(rowFtp * ftpMultiplier)));
    setSimRowWatts(desiredWatts);
    setSimRowStrokeRate(targetStrokeRate);
    if (!telemetry.isSimulating) {
      setTelemetry((prev) => ({ ...prev, sport: 'rowing', isSimulating: true }));
    }
  };

  // Treadmill Speed +/- Stepper Handler (FTMS 0x2AD9 OpCode 0x02 or Run Simulator)
  const adjustTreadmillSpeed = (deltaMph: number) => {
    const baseMph = telemetry.isSimulating ? simRunSpeedMph : telemetry.speedMph;
    const nextMph = Math.max(1.0, Math.min(15.0, Math.round((baseMph + deltaMph) * 10) / 10));
    if (telemetry.isSimulating || !telemetry.bikeConnected) {
      setSimRunSpeedMph(nextMph);
    }
    if (telemetry.bikeConnected && telemetry.bikeHasMotorizedSpeed) {
      void bikeBleRef.current?.setTargetSpeedMph(nextMph);
    } else {
      const speedMps = nextMph / 2.23693629;
      const watts = estimateRunningPowerWatts(speedMps, telemetry.inclinePct ?? 0, profile.weightLbs);
      setTelemetry((prev) => ({
        ...prev,
        speedMph: nextMph,
        powerWatts: watts,
      }));
    }
  };

  // Treadmill Incline +/- Stepper Handler (FTMS 0x2AD9 OpCode 0x03 or Run Simulator)
  const adjustTreadmillIncline = (deltaPct: number) => {
    const baseInc = telemetry.isSimulating ? simRunInclinePct : (telemetry.inclinePct ?? 0);
    const nextInc = Math.max(0, Math.min(15, Math.round((baseInc + deltaPct) * 10) / 10));
    if (telemetry.isSimulating || !telemetry.bikeConnected) {
      setSimRunInclinePct(nextInc);
    }
    if (telemetry.bikeConnected && telemetry.bikeHasMotorizedIncline) {
      void bikeBleRef.current?.setTargetInclinePct(nextInc);
    } else {
      const speedMps = telemetry.speedMph / 2.23693629;
      const watts = estimateRunningPowerWatts(speedMps, nextInc, profile.weightLbs);
      setTelemetry((prev) => ({
        ...prev,
        inclinePct: nextInc,
        powerWatts: watts,
      }));
    }
  };

  // Resistance / Damper +/- Stepper Handler (works on motorized BLE bikes, FTMS rowers, cadence-pod virtual gear, and Simulator)
  const adjustResistance = (delta: number) => {
    if (sportMode === 'running') {
      adjustTreadmillIncline(delta * 0.5);
      return;
    }

    if (sportMode === 'rowing') {
      const upperBound = telemetry.bikeConnected ? (telemetry.bikeMaxResistance ?? 10) : 10;
      const baseRes = telemetry.isSimulating ? simRowDamper : telemetry.resistance;
      const nextLevel = Math.max(1, Math.min(upperBound, baseRes + delta));
      if (telemetry.isSimulating || !telemetry.bikeConnected) {
        setSimRowDamper(nextLevel);
      }
      if (telemetry.bikeConnected) {
        void bikeBleRef.current?.setResistanceLevel(nextLevel);
      } else {
        setTelemetry((prev) => ({ ...prev, resistance: nextLevel }));
      }
      return;
    }

    const upperBound = telemetry.bikeMaxResistance ?? 32;
    const nextLevel = Math.max(1, Math.min(upperBound, telemetry.resistance + delta));
    if (telemetry.isSimulating) {
      setSimResistance(Math.min(32, nextLevel));
    }
    if (telemetry.bikeConnected) {
      void bikeBleRef.current?.setResistanceLevel(nextLevel);
    } else {
      const watts = calculateEchelonWatts(
        nextLevel,
        telemetry.cadenceRpm,
        profile.powerCurve,
        profile.wattGain,
        telemetry.bikeFamily,
        upperBound
      );
      setTelemetry((prev) => ({
        ...prev,
        resistance: nextLevel,
        powerWatts: watts,
      }));
    }
  };

  // Cloud Upload Handler (Strava, Garmin Connect, or Zwift-Style Push to Both)
  const handleCloudUploadRide = async (ride: SavedRide, target: CloudUploadTarget) => {
    const wantsStrava = target === 'strava' || target === 'both';
    const wantsGarmin = target === 'garmin' || target === 'both';

    if (wantsStrava && !stravaConfig.accessToken) {
      showToast('Connect your Strava account in the Cloud Sync panel first.');
      return;
    }
    if (wantsGarmin && !garminConfig.tokens) {
      showToast('Connect your Garmin Connect account in the Cloud Sync panel first.');
      return;
    }

    try {
      setUploadingRideId(ride.id);
      const latestStored = (await listSavedRides()).find((r) => r.id === ride.id);
      let updatedRide: SavedRide = { ...(latestStored ?? ride) };
      const uploadedTargets: string[] = [];

      if (wantsGarmin && !updatedRide.garminActivityId) {
        // Use 'import' mode when Strava is also being synced (or already linked) so Garmin
        // records the workout in Garmin Connect without forwarding a duplicate to Strava.
        const garminMode =
          target === 'both' || Boolean(stravaConfig.accessToken || updatedRide.stravaActivityId)
            ? 'import'
            : 'device';
        const { activityId: garminId } = await uploadRideToGarmin(updatedRide, {
          uploadMode: garminMode,
          onProgress: setUploadStatusText,
        });
        // Refresh rolling Garmin OAuth2 tokens in state
        setGarminConfig(loadGarminConfig());
        updatedRide = {
          ...updatedRide,
          garminActivityId: garminId,
          garminUploadedAtIso: new Date().toISOString(),
        };
        uploadedTargets.push('Garmin Connect');
      }

      if (wantsStrava && !updatedRide.stravaActivityId) {
        setUploadStatusText('Uploading to Strava...');
        const { uploadId, activityId } = await uploadRideToStrava(updatedRide, setUploadStatusText);
        updatedRide = {
          ...updatedRide,
          stravaUploadId: uploadId,
          stravaActivityId: activityId,
          stravaUploadedAtIso: new Date().toISOString(),
        };
        uploadedTargets.push('Strava');
      }

      await saveRideToDb(updatedRide);
      const nextList = await listSavedRides();
      setSavedRides(nextList);
      setHighlightedRide((prev) => (prev?.id === ride.id ? updatedRide : prev));

      if (uploadedTargets.length > 0) {
        showToast(`Workout pushed to ${uploadedTargets.join(' + ')}!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cloud upload failed.';
      showToast(msg);
    } finally {
      setUploadingRideId(null);
      setUploadStatusText('');
    }
  };

  const handleUpdateRideMeta = async (updatedRide: SavedRide) => {
    setHighlightedRide((prev) => (prev?.id === updatedRide.id ? updatedRide : prev));
    setSavedRides((prev) => prev.map((r) => (r.id === updatedRide.id ? updatedRide : r)));
    await saveRideToDb(updatedRide);
    const nextList = await listSavedRides();
    setSavedRides(nextList);
  };

  const handleSyncRemoteMeta = async (updatedRide: SavedRide) => {
    const syncedTargets: string[] = [];
    try {
      if (updatedRide.stravaActivityId && stravaConfig.accessToken) {
        await updateStravaActivityDetails(updatedRide);
        syncedTargets.push('Strava');
      }
      if (updatedRide.garminActivityId && garminConfig.tokens) {
        await updateGarminActivityDetails(updatedRide);
        setGarminConfig(loadGarminConfig());
        syncedTargets.push('Garmin');
      }
      if (syncedTargets.length > 0) {
        showToast(`Updated title & notes on ${syncedTargets.join(' + ')}!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update remote activity details.';
      showToast(msg);
    }
  };

  // Live Zone Computations Oriented to Athlete Profile & Active Sport
  const effectivePowerFtp =
    sportMode === 'rowing' ? getEffectiveRowFtpWatts(profile) : profile.ftpWatts;
  const hrZones = useMemo(() => getHrZones(profile.maxHrBpm), [profile.maxHrBpm]);
  const powerZones = useMemo(() => getPowerZones(effectivePowerFtp), [effectivePowerFtp]);
  const cadenceZones = useMemo(
    () =>
      sportMode === 'running'
        ? getRunningCadenceZones()
        : sportMode === 'rowing'
          ? getRowingStrokeRateZones()
          : getCadenceZones(),
    [sportMode]
  );

  const activeHrZone = resolveZone(telemetry.heartRateBpm, hrZones);
  const activePowerZone = resolveZone(telemetry.powerWatts, powerZones);
  const activeCadenceZone = resolveZone(telemetry.cadenceRpm, cadenceZones);
  const { zoneDef: headlineZone } = resolveHeadlineEffortZone(
    telemetry.heartRateBpm,
    telemetry.powerWatts,
    profile,
    {
      sport: sportMode,
      speedMph: telemetry.speedMph,
      inclinePct: telemetry.inclinePct,
    }
  );

  const isAnySensorLive =
    telemetry.powerWatts > 0 ||
    telemetry.speedMph > 0.2 ||
    telemetry.heartRateBpm > 0 ||
    rideState === 'running';

  const showResistanceStepper =
    sportMode === 'running'
      ? !telemetry.bikeConnected || Boolean(telemetry.bikeHasMotorizedIncline)
      : !telemetry.bikeConnected ||
        Boolean(telemetry.bikeHasMotorizedResistance) ||
        telemetry.bikeFamily === 'cadence-bike';

  const showSpeedStepper =
    sportMode === 'running' &&
    (!telemetry.bikeConnected || Boolean(telemetry.bikeHasMotorizedSpeed));

  const speedControl = showSpeedStepper ? (
    <div className="resistance-stepper">
      <button
        type="button"
        id="treadmill-speed-dec-btn"
        className="stepper-btn"
        onClick={() => adjustTreadmillSpeed(-0.2)}
        aria-label="Decrease treadmill speed"
      >
        −
      </button>
      <button
        type="button"
        id="treadmill-speed-inc-btn"
        className="stepper-btn"
        onClick={() => adjustTreadmillSpeed(0.2)}
        aria-label="Increase treadmill speed"
      >
        +
      </button>
    </div>
  ) : null;

  const resistanceControl = showResistanceStepper ? (
    <div className="resistance-stepper">
      <button
        type="button"
        id="resistance-dec-btn"
        className="stepper-btn"
        onClick={() => adjustResistance(-1)}
        aria-label={
          sportMode === 'running'
            ? 'Decrease incline'
            : sportMode === 'rowing'
              ? 'Decrease damper'
              : 'Decrease resistance'
        }
      >
        −
      </button>
      <button
        type="button"
        id="resistance-inc-btn"
        className="stepper-btn"
        onClick={() => adjustResistance(1)}
        aria-label={
          sportMode === 'running'
            ? 'Increase incline'
            : sportMode === 'rowing'
              ? 'Increase damper'
              : 'Increase resistance'
        }
      >
        +
      </button>
    </div>
  ) : null;

  const isShortLandscape =
    viewportDims.height <= 540 && viewportDims.width > viewportDims.height;
  const isPhonePortrait = viewportDims.width < 600;
  const isStackedSplitTablet =
    ytLayoutMode === 'split' && viewportDims.width >= 600 && viewportDims.width <= 1080;

  const renderedCockpitTiles: CockpitTileId[] =
    gaugeMode === 'bars'
      ? primaryGaugeOrder
      : ytLayoutMode === 'split'
        ? focusTileOrder
        : layoutPrefs.tileOrder;

  const visibleCockpitTiles: CockpitTileId[] =
    gaugeMode === 'bars'
      ? primaryGaugeOrder
      : isShortLandscape || isStackedSplitTablet
        ? layoutPrefs.tileOrder.slice(0, 3)
        : isPhonePortrait || ytLayoutMode === 'split'
          ? focusTileOrder
          : layoutPrefs.tileOrder;

  const hasCockpitStats =
    gaugeMode === 'rings' && renderedCockpitTiles.includes('stats');
  const hasPortraitCockpitStats =
    gaugeMode === 'rings' && renderedCockpitTiles.slice(0, 4).includes('stats');
  const hasCockpitZones =
    gaugeMode === 'rings' && ytLayoutMode !== 'split' && renderedCockpitTiles.includes('zones');

  const makeTileArrange = (tileId: CockpitTileId): TileArrangeBinding | undefined => {
    if (!isArrangingLayout) return undefined;
    const visIdx = visibleCockpitTiles.indexOf(tileId);
    return {
      tileId,
      label: COCKPIT_TILE_META[tileId].label,
      canMoveEarlier: visIdx > 0,
      canMoveLater: visIdx >= 0 && visIdx < visibleCockpitTiles.length - 1,
      isDragging: draggedTileId === tileId,
      isDragOver: dragOverTileId === tileId && draggedTileId !== null && draggedTileId !== tileId,
      onMoveEarlier: () =>
        handleUpdateLayoutPrefs({
          ...layoutPrefs,
          tileOrder: moveOrderItemWithinSubset(
            layoutPrefs.tileOrder,
            visibleCockpitTiles,
            tileId,
            -1
          ),
        }),
      onMoveLater: () =>
        handleUpdateLayoutPrefs({
          ...layoutPrefs,
          tileOrder: moveOrderItemWithinSubset(
            layoutPrefs.tileOrder,
            visibleCockpitTiles,
            tileId,
            1
          ),
        }),
      onDragStart: (e) => {
        setDraggedTileId(tileId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `tile:${tileId}`);
      },
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverTileId !== tileId) setDragOverTileId(tileId);
      },
      onDragLeave: () => {
        if (dragOverTileId === tileId) setDragOverTileId(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('text/plain');
        const sourceId = (
          draggedTileId ?? (raw.startsWith('tile:') ? raw.slice(5) : '')
        ) as CockpitTileId;
        if (sourceId && layoutPrefs.tileOrder.includes(sourceId) && sourceId !== tileId) {
          handleUpdateLayoutPrefs({
            ...layoutPrefs,
            tileOrder: reorderOrderItem(layoutPrefs.tileOrder, sourceId, tileId),
          });
        }
        setDraggedTileId(null);
        setDragOverTileId(null);
      },
      onDragEnd: () => {
        setDraggedTileId(null);
        setDragOverTileId(null);
      },
    };
  };

  const liveRowSplit =
    telemetry.paceSecPer500m && telemetry.paceSecPer500m > 0
      ? telemetry.paceSecPer500m
      : rowingWattsToSplitSecPer500m(telemetry.powerWatts);

  const secondaryStatContent: Record<
    SecondaryStatId,
    { label: string; value: string; sub: string }
  > =
    sportMode === 'running'
      ? {
          speed: {
            label: 'Belt Speed',
            value: `${telemetry.speedMph.toFixed(1)} mph`,
            sub: `${formatRunningPacePerMile(telemetry.speedMph)} /mi · ${(telemetry.speedMph * 1.60934).toFixed(1)} km/h`,
          },
          distance: {
            label: 'Distance',
            value: `${metersToMiles(distanceMeters).toFixed(2)} mi`,
            sub: `${(distanceMeters / 1000).toFixed(2)} km`,
          },
          calories: {
            label: 'Active Calories',
            value: `${Math.round(caloriesKcal)} kcal`,
            sub: 'ACSM incline & speed',
          },
          avgPower: {
            label: 'Incline / Power',
            value: `${(telemetry.inclinePct ?? 0).toFixed(1)}%`,
            sub: `Avg ${avgRideWatts}W · NP ${npRideWatts}W`,
          },
          burnTime: {
            label: 'Burn Zone Time',
            value: formatDuration(burnZoneTotalSec),
            sub: `${burnPoints} Burn pts earned`,
          },
        }
      : sportMode === 'rowing'
        ? {
            speed: {
              label: 'Live Split',
              value: `${formatRowingSplit(liveRowSplit)} /500m`,
              sub: `${Math.round(telemetry.powerWatts)}W · ${Math.round(telemetry.cadenceRpm)} spm`,
            },
            distance: {
              label: 'Meters Rowed',
              value: `${Math.round(distanceMeters).toLocaleString('en-US')} m`,
              sub: `${(distanceMeters / 1000).toFixed(2)} km · ${telemetry.strokeCount ?? 0} strokes`,
            },
            calories: {
              label: 'Active Calories',
              value: `${Math.round(caloriesKcal)} kcal`,
              sub: 'Erg wattage calibrated',
            },
            avgPower: {
              label: 'Avg / NP Power',
              value: `${avgRideWatts}W / ${npRideWatts}W`,
              sub:
                avgRideWatts > 0
                  ? `Avg ${formatRowingSplit(rowingWattsToSplitSecPer500m(avgRideWatts))} /500m`
                  : `Row FTP ${effectivePowerFtp}W`,
            },
            burnTime: {
              label: 'Burn Zone Time',
              value: formatDuration(burnZoneTotalSec),
              sub: `${burnPoints} Burn pts earned`,
            },
          }
        : {
            speed: {
              label: 'Virtual Speed',
              value: `${telemetry.speedMph.toFixed(1)} mph`,
              sub: `Aero ${formatHeightImperial(profile.heightFeet, profile.heightInches)} · ${profile.weightLbs}#`,
            },
            distance: {
              label: 'Distance',
              value: `${metersToMiles(distanceMeters).toFixed(2)} mi`,
              sub: `${(distanceMeters / 1000).toFixed(2)} km`,
            },
            calories: {
              label: 'Active Calories',
              value: `${Math.round(caloriesKcal)} kcal`,
              sub: 'Power & HR calibrated',
            },
            avgPower: {
              label: 'Avg / NP Power',
              value: `${avgRideWatts}W / ${npRideWatts}W`,
              sub: `${computeWattsPerKg(avgRideWatts, profile.weightLbs).toFixed(2)} Avg W/kg`,
            },
            burnTime: {
              label: 'Burn Zone Time',
              value: formatDuration(burnZoneTotalSec),
              sub: `${burnPoints} Burn pts earned`,
            },
          };

  return (
    <div
      className={`app-shell mode-${gaugeMode}${ytLayoutMode === 'split' ? ' yt-split' : ''}${isArrangingLayout ? ' arranging-layout' : ''}${hasCockpitStats ? ' has-cockpit-stats' : ''}${hasPortraitCockpitStats ? ' has-portrait-stats' : ''}${hasCockpitZones ? ' has-cockpit-zones' : ''}`}
    >
      {!EchelonBikeConnection.isSupported() && !bleBannerDismissed && (
        <div
          role="alert"
          style={{
            background: 'rgba(249, 115, 22, 0.16)',
            border: '1px solid rgba(249, 115, 22, 0.42)',
            borderRadius: '10px',
            padding: '10px 12px',
            margin: '8px',
            fontSize: '0.85rem',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: 1 }}>
            <strong>Bluetooth isn&apos;t available in this browser.</strong>{' '}
            {getBluetoothUnsupportedMessage()} You can still try everything with Simulate Ride.
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setBleBannerDismissed(true);
              try {
                sessionStorage.setItem('jbf-ble-banner-dismissed', '1');
              } catch {
                /* ignore */
              }
            }}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}
      {/* Top Studio Header + Athlete Stats Orientation Chip */}
      <header className="topbar">
        <div className="brand-lockup">
          <img
            src="/jbf-logo-192.png"
            alt="Just Believe Fitness"
            className="brand-logo-img"
            width={38}
            height={38}
          />
          <div className="brand-copy">
            <h1 className="brand-title">Just Believe Fitness</h1>
            <div className="brand-sub">Multi-Sport FTMS Studio · Bike · Run · Row</div>
          </div>
        </div>

        <div className="topbar-utility-btns">
          <button
            type="button"
            id="customize-layout-btn"
            className={`btn btn-sm topbar-icon-btn${isArrangingLayout || isLayoutModalOpen ? ' btn-primary' : ''}`}
            onClick={() => setIsLayoutModalOpen(true)}
            aria-label="Customize tiles and icons layout"
            title="Customize tiles and icons layout"
          >
            <LayoutGrid size={16} />
          </button>
          <a
            id="topbar-github-link"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm topbar-github-btn"
            aria-label="Open source on GitHub — view, edit, or improve the code"
            title="Open source on GitHub — view, edit, or improve the code"
          >
            <GitHubMarkIcon size={16} />
          </a>
        </div>

        {/* Athlete Quick-Input Orientation Button */}
        <button
          type="button"
          id="athlete-stats-chip"
          className="athlete-chip"
          onClick={() => setIsAthleteModalOpen(true)}
          title="Click to edit height, weight, FTP, Run Pace, Row FTP, and Max HR"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={14} color="var(--accent-orange)" />
            <span className="athlete-chip-label">{profile.name}</span>
          </span>
          <span className="athlete-chip-stats tabular">
            {formatHeightImperial(profile.heightFeet, profile.heightInches)} · {profile.weightLbs}# ·{' '}
            {sportMode === 'running'
              ? `${formatPaceSeconds(getEffectiveRunThresholdPaceSec(profile))}/mi Thr`
              : sportMode === 'rowing'
                ? `${effectivePowerFtp}W Row`
                : `${profile.ftpWatts}W FTP`}{' '}
            · {profile.maxHrBpm} HR
          </span>
        </button>

        <div className="topbar-actions">
          {updateAvailable && (
            <button
              type="button"
              id="apply-pwa-update-btn"
              className="btn btn-sm btn-primary"
              onClick={() => window.location.reload()}
              title="Load latest app update (keeps all rides, profile & sync settings intact)"
            >
              Update Ready · Reload
            </button>
          )}
          {layoutPrefs.topbarActionOrder.map((actionId, idx) => {
            let btn: ReactNode;
            if (actionId === 'sensors') {
              btn = (
                <button
                  key="sensors"
                  type="button"
                  id="open-sensors-btn"
                  data-action-id="sensors"
                  className="btn btn-sm"
                  onClick={() => {
                    if (!isArrangingLayout) setIsDeviceModalOpen(true);
                  }}
                >
                  <span
                    className={`status-dot ${
                      telemetry.bikeConnected && telemetry.hrConnected
                        ? 'connected'
                        : telemetry.bikeConnected || telemetry.hrConnected
                          ? 'connecting'
                          : ''
                    }`}
                  />
                  <Bluetooth size={15} />
                  {telemetry.bikeConnected
                    ? telemetry.hrConnected
                      ? `${telemetry.bikeShortLabel || 'Machine'} + HR`
                      : `${telemetry.bikeShortLabel || 'Machine'} Connected`
                    : telemetry.hrConnected
                      ? telemetry.hrName || 'HR Connected'
                      : 'Pair Sensors'}
                </button>
              );
            } else if (actionId === 'youtube') {
              btn = (
                <button
                  key="youtube"
                  type="button"
                  id="toggle-youtube-btn"
                  data-action-id="youtube"
                  className={`btn btn-sm ${ytLayoutMode !== 'closed' ? 'btn-primary' : ''}`}
                  onClick={() => {
                    if (!isArrangingLayout) {
                      setYtLayoutMode((curr) => (curr === 'closed' ? 'split' : 'closed'));
                    }
                  }}
                >
                  <Tv size={15} /> YouTube
                </button>
              );
            } else if (actionId === 'pip') {
              btn = (
                <button
                  key="pip"
                  type="button"
                  id="topbar-hud-pip-btn"
                  data-action-id="pip"
                  className={`btn btn-sm ${isHudPipActive ? 'btn-primary' : ''}`}
                  onClick={() => {
                    if (!isArrangingLayout) void handleLaunchHudPip();
                  }}
                  title="Pop out floating Power/Cadence/HR gauges over YouTube"
                >
                  <PictureInPicture2 size={15} /> HUD PiP
                </button>
              );
            } else if (actionId === 'simulate') {
              btn = (
                <button
                  key="simulate"
                  type="button"
                  id="toggle-sim-quick-btn"
                  data-action-id="simulate"
                  className={`btn btn-sm ${telemetry.isSimulating ? 'btn-primary' : ''}`}
                  onClick={() => {
                    if (!isArrangingLayout) {
                      setTelemetry((prev) => ({ ...prev, isSimulating: !prev.isSimulating }));
                    }
                  }}
                >
                  {telemetry.isSimulating ? 'Sim Live' : 'Simulate'}
                </button>
              );
            } else {
              btn = (
                <button
                  key="history"
                  type="button"
                  id="open-history-btn"
                  data-action-id="history"
                  className="btn btn-sm"
                  onClick={() => {
                    if (!isArrangingLayout) {
                      setHighlightedRide(null);
                      setIsHistoryModalOpen(true);
                    }
                  }}
                >
                  <History size={15} /> Rides &amp; Sync ({savedRides.length})
                </button>
              );
            }

            if (!isArrangingLayout) {
              return btn;
            }
            const isDragging =
              draggedControl?.group === 'topbar' && draggedControl.id === actionId;
            const isDragOver =
              dragOverControl?.group === 'topbar' &&
              dragOverControl.id === actionId &&
              draggedControl?.id !== actionId;
            return (
              <div
                key={actionId}
                className={`arrange-control-chip${isDragging ? ' is-dragging' : ''}${isDragOver ? ' is-drag-over' : ''}`}
                data-arrange-topbar-id={actionId}
                draggable
                onDragStart={(e) => {
                  setDraggedControl({ group: 'topbar', id: actionId });
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', `topbar:${actionId}`);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverControl?.group !== 'topbar' || dragOverControl.id !== actionId) {
                    setDragOverControl({ group: 'topbar', id: actionId });
                  }
                }}
                onDragLeave={() => {
                  if (dragOverControl?.group === 'topbar' && dragOverControl.id === actionId) {
                    setDragOverControl(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData('text/plain');
                  const sourceId = (
                    draggedControl?.group === 'topbar'
                      ? draggedControl.id
                      : raw.startsWith('topbar:')
                        ? raw.slice(7)
                        : ''
                  ) as TopbarActionId;
                  if (
                    sourceId &&
                    layoutPrefs.topbarActionOrder.includes(sourceId) &&
                    sourceId !== actionId
                  ) {
                    handleUpdateLayoutPrefs({
                      ...layoutPrefs,
                      topbarActionOrder: reorderOrderItem(
                        layoutPrefs.topbarActionOrder,
                        sourceId,
                        actionId
                      ),
                    });
                  }
                  setDraggedControl(null);
                  setDragOverControl(null);
                }}
                onDragEnd={() => {
                  setDraggedControl(null);
                  setDragOverControl(null);
                }}
              >
                <button
                  type="button"
                  className="arrange-chip-nudge"
                  disabled={idx === 0}
                  onClick={() =>
                    handleUpdateLayoutPrefs({
                      ...layoutPrefs,
                      topbarActionOrder: moveOrderItem(layoutPrefs.topbarActionOrder, actionId, -1),
                    })
                  }
                  aria-label={`Move ${TOPBAR_ACTION_META[actionId].label} earlier`}
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="arrange-chip-inner">{btn}</span>
                <button
                  type="button"
                  className="arrange-chip-nudge"
                  disabled={idx === layoutPrefs.topbarActionOrder.length - 1}
                  onClick={() =>
                    handleUpdateLayoutPrefs({
                      ...layoutPrefs,
                      topbarActionOrder: moveOrderItem(layoutPrefs.topbarActionOrder, actionId, 1),
                    })
                  }
                  aria-label={`Move ${TOPBAR_ACTION_META[actionId].label} later`}
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </header>

      {/* Inline Arrange Mode Banner */}
      {isArrangingLayout && (
        <section
          className="arrange-mode-banner"
          id="arrange-mode-banner"
          role="region"
          aria-label="Arrange layout controls"
        >
          <div className="arrange-banner-copy">
            <GripVertical size={15} color="var(--accent-orange)" aria-hidden="true" />
            <strong>ARRANGE MODE:</strong>
            <span>Drag tiles or icons, or tap arrows to customize your screen order.</span>
          </div>
          <div className="arrange-banner-actions">
            <button
              type="button"
              id="open-layout-panel-from-arrange-btn"
              className="btn btn-sm"
              onClick={() => setIsLayoutModalOpen(true)}
            >
              <SlidersHorizontal size={14} /> Layout Panel
            </button>
            <button
              type="button"
              id="reset-layout-arrange-btn"
              className="btn btn-sm"
              disabled={isDefaultLayoutPrefs(layoutPrefs)}
              onClick={() => handleUpdateLayoutPrefs(createDefaultLayoutPrefs())}
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              type="button"
              id="finish-arrange-layout-btn"
              className="btn btn-sm btn-primary"
              onClick={() => setIsArrangingLayout(false)}
            >
              Done
            </button>
          </div>
        </section>
      )}

      {/* JBF Solid 5-Zone Intensity Effort Ribbon */}
      <section
        className="effort-ribbon"
        id="jbf-effort-ribbon"
        style={{
          backgroundColor: isAnySensorLive ? headlineZone.color : '#1C2330',
          color: isAnySensorLive ? headlineZone.textOnFill : '#F8FAFC',
        }}
      >
        <div className="effort-ribbon-left">
          <span className="effort-zone-title">
            {isAnySensorLive
              ? `ZONE ${headlineZone.zone} · ${headlineZone.stageLabel}`
              : 'READY · PAIR OR START'}
          </span>
          <span className="effort-cue-meta">
            {activeSegmentInfo ? (
              activeSegmentInfo.distanceMode?.isGoalComplete ? (
                <>
                  <strong>CHALLENGE COMPLETE:</strong> {selectedWorkout.name} (
                  {formatDistanceTarget(
                    activeSegmentInfo.distanceMode.totalTargetMeters,
                    activeSegmentInfo.distanceMode.unit
                  )}
                  ) — ease into a cool-down or Stop &amp; Save
                </>
              ) : sportMode === 'running' && activeSegmentInfo.targets.targetSpeedMphRange ? (
                <>
                  <strong>{cueDisplayLabel(activeSegmentInfo.segment.cue)}:</strong>{' '}
                  {activeSegmentInfo.segment.label} (
                  {activeSegmentInfo.targets.targetSpeedMphRange[0].toFixed(1)}–
                  {activeSegmentInfo.targets.targetSpeedMphRange[1].toFixed(1)} mph ·{' '}
                  {(activeSegmentInfo.targets.targetInclinePct ?? 1.0).toFixed(1)}% incline)
                </>
              ) : sportMode === 'rowing' && activeSegmentInfo.targets.targetSplitSecRange ? (
                <>
                  <strong>{cueDisplayLabel(activeSegmentInfo.segment.cue)}:</strong>{' '}
                  {activeSegmentInfo.segment.label} (
                  {formatRowingSplit(activeSegmentInfo.targets.targetSplitSecRange[0])}–
                  {formatRowingSplit(activeSegmentInfo.targets.targetSplitSecRange[1])}/500m ·{' '}
                  {activeSegmentInfo.segment.cadenceRange[0]}–
                  {activeSegmentInfo.segment.cadenceRange[1]} spm)
                </>
              ) : (
                <>
                  <strong>{cueDisplayLabel(activeSegmentInfo.segment.cue)}:</strong>{' '}
                  {activeSegmentInfo.segment.label} ({activeSegmentInfo.targets.minWatts}–
                  {activeSegmentInfo.targets.maxWatts}W · ~Res{' '}
                  {activeSegmentInfo.targets.suggestedResistanceLow}–
                  {activeSegmentInfo.targets.suggestedResistanceHigh})
                </>
              )
            ) : sportMode === 'running' ? (
              <>
                Run Threshold {formatPaceSeconds(getEffectiveRunThresholdPaceSec(profile))}/mi ·
                Burn Zone ≥ {hrZones[3].minValue} bpm
              </>
            ) : sportMode === 'rowing' ? (
              <>
                Row FTP {effectivePowerFtp}W (
                {formatRowingSplit(rowingWattsToSplitSecPer500m(effectivePowerFtp))}/500m) · Burn
                Zone ≥ {hrZones[3].minValue} bpm
              </>
            ) : (
              <>
                Threshold {profile.ftpWatts}W (
                {computeWattsPerKg(profile.ftpWatts, profile.weightLbs).toFixed(2)} W/kg) · Burn
                Zone ≥ {hrZones[3].minValue} bpm
              </>
            )}
          </span>
        </div>

        <div className="effort-ribbon-right tabular">
          {activeSegmentInfo && !activeSegmentInfo.distanceMode && (
            <div className="ribbon-stat">
              <span className="ribbon-stat-label">Interval Left</span>
              <span className="ribbon-stat-val">
                {formatDuration(activeSegmentInfo.remainingSec)}
              </span>
            </div>
          )}

          {activeSegmentInfo?.distanceMode && (
            <>
              <div className="ribbon-stat">
                <span className="ribbon-stat-label">To Go</span>
                <span className="ribbon-stat-val" id="ride-distance-remaining">
                  {activeSegmentInfo.distanceMode.isGoalComplete
                    ? 'DONE'
                    : formatDistanceValue(
                        activeSegmentInfo.distanceMode.totalRemainingMeters,
                        activeSegmentInfo.distanceMode.unit
                      )}
                </span>
              </div>
              <div className="ribbon-stat">
                <span className="ribbon-stat-label">ETA</span>
                <span className="ribbon-stat-val" id="ride-distance-eta">
                  {activeSegmentInfo.distanceMode.isGoalComplete
                    ? '00:00'
                    : activeSegmentInfo.distanceMode.etaRemainingSec !== null
                      ? formatDuration(activeSegmentInfo.distanceMode.etaRemainingSec)
                      : '--'}
                </span>
              </div>
            </>
          )}

          <div className="ribbon-stat">
            <span className="ribbon-stat-label">Elapsed</span>
            <span className="ribbon-stat-val" id="ride-elapsed-clock">
              {formatDuration(elapsedSec)}
            </span>
          </div>

          <div className="ribbon-stat">
            <span className="ribbon-stat-label">Burn Points</span>
            <span
              className="ribbon-stat-val"
              id="ride-burn-points"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Flame size={20} /> {burnPoints}
            </span>
          </div>
        </div>
      </section>

      {/* Sport Switcher, Workout Selector, Gauge Style Switcher (Rings vs Bars), & Transport Bar */}
      <section className="workout-strip">
        <div className="workout-picker-group">
          <div
            id="sport-mode-switcher"
            className="gauge-toggle-group sport-toggle-group"
            role="group"
            aria-label="Sport mode"
          >
            <button
              type="button"
              id="sport-mode-cycling-btn"
              className={`gauge-toggle-btn ${sportMode === 'cycling' ? 'active' : ''}`}
              aria-pressed={sportMode === 'cycling'}
              onClick={() => handleSelectSportMode('cycling')}
              title="Indoor Cycling (Echelon, FTMS Bike, Power Meter)"
            >
              Bike
            </button>
            <button
              type="button"
              id="sport-mode-running-btn"
              className={`gauge-toggle-btn ${sportMode === 'running' ? 'active' : ''}`}
              aria-pressed={sportMode === 'running'}
              onClick={() => handleSelectSportMode('running')}
              title="Treadmill & Running (FTMS Treadmill 0x2ACD, BLE Footpod 0x1814)"
            >
              Run
            </button>
            <button
              type="button"
              id="sport-mode-rowing-btn"
              className={`gauge-toggle-btn ${sportMode === 'rowing' ? 'active' : ''}`}
              aria-pressed={sportMode === 'rowing'}
              onClick={() => handleSelectSportMode('rowing')}
              title="Indoor Rowing (Concept2 PM5, WaterRower, FTMS Rower 0x2AD1)"
            >
              Row
            </button>
          </div>

          <select
            id="workout-template-select"
            className="workout-select"
            value={selectedWorkout.id}
            onChange={(e) => {
              setSelectedWorkoutId(e.target.value);
              setSegmentOffsetSec(0);
            }}
          >
            {groupWorkoutTemplates(activeWorkouts, sportMode).map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.workouts.map((w) => (
                  <option key={w.id} value={w.id}>
                    {formatWorkoutOptionLabel(w)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {activeSegmentInfo ? (
            <button
              type="button"
              className="segment-target-callout segment-callout-btn tabular"
              onClick={handleOpenFocusMode}
              title="Open Full-Screen Focused Workout Mode with instructions & 4-grid"
            >
              <span>
                {activeSegmentInfo.distanceMode ? (
                  activeSegmentInfo.distanceMode.isGoalComplete ? (
                    <>
                      <strong>Goal Complete (100%):</strong> {selectedWorkout.name} reached!
                    </>
                  ) : (
                    <>
                      <strong>
                        Stage {activeSegmentInfo.index + 1}/{activeSegmentInfo.totalSegments} (
                        {Math.round(activeSegmentInfo.distanceMode.overallProgressPct)}% ·{' '}
                        {formatDistanceValue(
                          activeSegmentInfo.distanceMode.stageRemainingMeters,
                          activeSegmentInfo.distanceMode.unit
                        )}{' '}
                        left):
                      </strong>{' '}
                      {activeSegmentInfo.segment.coachingNote}
                    </>
                  )
                ) : (
                  <>
                    <strong>
                      Block {activeSegmentInfo.index + 1}/{activeSegmentInfo.totalSegments}:
                    </strong>{' '}
                    {activeSegmentInfo.segment.coachingNote}
                  </>
                )}
              </span>
              <Maximize2 size={13} style={{ flexShrink: 0, opacity: 0.75 }} />
            </button>
          ) : (
            <button
              type="button"
              className="segment-target-callout segment-callout-btn"
              onClick={handleOpenFocusMode}
              title="Open Full-Screen Focused Workout Mode"
            >
              <span>
                {sportMode === 'running'
                  ? 'Open Run'
                  : sportMode === 'rowing'
                    ? 'Open Row'
                    : 'Open Ride'}{' '}
                · Tap Focus for full-screen 4-grid cockpit
              </span>
              <Maximize2 size={13} style={{ flexShrink: 0, opacity: 0.75 }} />
            </button>
          )}
        </div>

        <div className="transport-controls">
          {layoutPrefs.transportControlOrder.map((controlId, idx) => {
            let node: ReactNode;
            if (controlId === 'gaugeMode') {
              node = (
                <div
                  key="gaugeMode"
                  className="gauge-toggle-group"
                  data-control-id="gaugeMode"
                  role="group"
                  aria-label="Gauge display style"
                >
                  <button
                    type="button"
                    id="gauge-mode-rings-btn"
                    className={`gauge-toggle-btn ${gaugeMode === 'rings' ? 'active' : ''}`}
                    onClick={() => {
                      if (!isArrangingLayout) handleSelectGaugeMode('rings');
                    }}
                    title="Compact 2/3-column Speedometer Ring Grid"
                  >
                    <Gauge size={14} /> Rings
                  </button>
                  <button
                    type="button"
                    id="gauge-mode-bars-btn"
                    className={`gauge-toggle-btn ${gaugeMode === 'bars' ? 'active' : ''}`}
                    onClick={() => {
                      if (!isArrangingLayout) handleSelectGaugeMode('bars');
                    }}
                    title="Horizontal Segmented Zone Bars"
                  >
                    <Rows3 size={14} /> Bars
                  </button>
                </div>
              );
            } else if (controlId === 'focus') {
              node = (
                <button
                  key="focus"
                  type="button"
                  id="open-focus-mode-btn"
                  data-control-id="focus"
                  className="btn btn-sm focus-launch-btn"
                  onClick={() => {
                    if (!isArrangingLayout) handleOpenFocusMode();
                  }}
                  title="Enter Full-Screen Focused 4-Grid Cockpit with Workout Instructions & Play/Pause"
                >
                  <Maximize2 size={14} /> Focus
                </button>
              );
            } else if (controlId === 'rideAction') {
              node = (
                <div key="rideAction" className="transport-ride-group" data-control-id="rideAction">
                  {rideState !== 'running' ? (
                    <button
                      type="button"
                      id="start-ride-btn"
                      className="btn btn-primary"
                      onClick={() => {
                        if (!isArrangingLayout) handleStartOrResume();
                      }}
                    >
                      <Play size={16} /> {rideState === 'paused' ? 'Resume' : 'Start'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      id="pause-ride-btn"
                      className="btn"
                      onClick={() => {
                        if (!isArrangingLayout) setRideState('paused');
                      }}
                    >
                      <Pause size={16} /> Pause
                    </button>
                  )}

                  {activeSegmentInfo &&
                    !activeSegmentInfo.distanceMode &&
                    activeSegmentInfo.nextSegment &&
                    rideState !== 'idle' && (
                      <button
                        type="button"
                        id="skip-segment-btn"
                        className="btn btn-sm"
                        onClick={() => {
                          if (!isArrangingLayout) handleSkipSegment();
                        }}
                        title="Skip to next interval block"
                      >
                        <FastForward size={15} /> Next
                      </button>
                    )}

                  {(rideState !== 'idle' || elapsedSec > 0) && (
                    <>
                      <button
                        type="button"
                        id="finish-save-ride-btn"
                        className="btn btn-strava"
                        onClick={() => {
                          if (!isArrangingLayout) requestStopWorkoutConfirmation('save');
                        }}
                      >
                        <Square size={15} /> Stop &amp; Save
                      </button>
                      <button
                        type="button"
                        id="reset-ride-btn"
                        className="btn btn-sm"
                        onClick={() => {
                          if (!isArrangingLayout) requestStopWorkoutConfirmation('discard');
                        }}
                        title="Discard & reset timer"
                      >
                        <RotateCcw size={15} />
                      </button>
                    </>
                  )}
                </div>
              );
            } else {
              node = (
                <button
                  key="audio"
                  type="button"
                  id="toggle-audio-cues-btn"
                  data-control-id="audio"
                  className={`btn btn-sm ${audioEnabled ? 'btn-primary' : ''}`}
                  onClick={() => {
                    if (!isArrangingLayout) handleToggleAudio();
                  }}
                  aria-pressed={audioEnabled}
                  title={
                    audioEnabled
                      ? 'Coach audio ON (mixes over music) — tap to mute'
                      : 'Coach audio OFF (keeps music uninterrupted) — tap to opt in'
                  }
                >
                  {audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  <span>{audioEnabled ? 'Coach On' : 'Audio Off'}</span>
                </button>
              );
            }

            if (!isArrangingLayout) {
              return node;
            }
            const isDragging =
              draggedControl?.group === 'transport' && draggedControl.id === controlId;
            const isDragOver =
              dragOverControl?.group === 'transport' &&
              dragOverControl.id === controlId &&
              draggedControl?.id !== controlId;
            return (
              <div
                key={controlId}
                className={`arrange-control-chip${isDragging ? ' is-dragging' : ''}${isDragOver ? ' is-drag-over' : ''}`}
                data-arrange-control-id={controlId}
                draggable
                onDragStart={(e) => {
                  setDraggedControl({ group: 'transport', id: controlId });
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', `transport:${controlId}`);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverControl?.group !== 'transport' || dragOverControl.id !== controlId) {
                    setDragOverControl({ group: 'transport', id: controlId });
                  }
                }}
                onDragLeave={() => {
                  if (dragOverControl?.group === 'transport' && dragOverControl.id === controlId) {
                    setDragOverControl(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData('text/plain');
                  const sourceId = (
                    draggedControl?.group === 'transport'
                      ? draggedControl.id
                      : raw.startsWith('transport:')
                        ? raw.slice(10)
                        : ''
                  ) as TransportControlId;
                  if (
                    sourceId &&
                    layoutPrefs.transportControlOrder.includes(sourceId) &&
                    sourceId !== controlId
                  ) {
                    handleUpdateLayoutPrefs({
                      ...layoutPrefs,
                      transportControlOrder: reorderOrderItem(
                        layoutPrefs.transportControlOrder,
                        sourceId,
                        controlId
                      ),
                    });
                  }
                  setDraggedControl(null);
                  setDragOverControl(null);
                }}
                onDragEnd={() => {
                  setDraggedControl(null);
                  setDragOverControl(null);
                }}
              >
                <button
                  type="button"
                  className="arrange-chip-nudge"
                  disabled={idx === 0}
                  onClick={() =>
                    handleUpdateLayoutPrefs({
                      ...layoutPrefs,
                      transportControlOrder: moveOrderItem(
                        layoutPrefs.transportControlOrder,
                        controlId,
                        -1
                      ),
                    })
                  }
                  aria-label={`Move ${TRANSPORT_CONTROL_META[controlId].label} earlier`}
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="arrange-chip-inner">{node}</span>
                <button
                  type="button"
                  className="arrange-chip-nudge"
                  disabled={idx === layoutPrefs.transportControlOrder.length - 1}
                  onClick={() =>
                    handleUpdateLayoutPrefs({
                      ...layoutPrefs,
                      transportControlOrder: moveOrderItem(
                        layoutPrefs.transportControlOrder,
                        controlId,
                        1
                      ),
                    })
                  }
                  aria-label={`Move ${TRANSPORT_CONTROL_META[controlId].label} later`}
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Multi-Sport Simulator Controls when Simulating */}
      {telemetry.isSimulating && (
        <section className="sim-bar" id="simulator-controls-bar">
          {sportMode === 'running' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.78rem', color: 'var(--accent-orange)' }}>
                  RUN SIM:
                </strong>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRunSimulatorEffort(0.55, 1.0)}
                >
                  Walk (Grey)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRunSimulatorEffort(0.75, 1.0)}
                >
                  Easy (Blue)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRunSimulatorEffort(0.88, 1.0)}
                >
                  Base (Green)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRunSimulatorEffort(1.0, 2.0)}
                >
                  Push (Orange)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRunSimulatorEffort(1.16, 1.0)}
                >
                  Sprint (Red)
                </button>
              </div>

              <div className="sim-sliders tabular">
                <label className="sim-slider-label">
                  Speed {simRunSpeedMph.toFixed(1)} mph ({formatRunningPacePerMile(simRunSpeedMph)}/mi)
                  <input
                    id="sim-run-speed-slider"
                    type="range"
                    min={2}
                    max={13}
                    step={0.1}
                    value={simRunSpeedMph}
                    onChange={(e) => setSimRunSpeedMph(Number(e.target.value))}
                  />
                </label>
                <label className="sim-slider-label">
                  Incline {simRunInclinePct.toFixed(1)}%
                  <input
                    id="sim-run-incline-slider"
                    type="range"
                    min={0}
                    max={15}
                    step={0.5}
                    value={simRunInclinePct}
                    onChange={(e) => setSimRunInclinePct(Number(e.target.value))}
                  />
                </label>
              </div>
            </>
          ) : sportMode === 'rowing' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.78rem', color: 'var(--accent-orange)' }}>
                  ROW SIM:
                </strong>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRowSimulatorEffort(0.65, 20)}
                >
                  Paddle (Blue)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRowSimulatorEffort(0.84, 24)}
                >
                  Steady (Green)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRowSimulatorEffort(1.0, 28)}
                >
                  2K Pace (Orange)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applyRowSimulatorEffort(1.24, 33)}
                >
                  Sprint (Red)
                </button>
              </div>

              <div className="sim-sliders tabular">
                <label className="sim-slider-label">
                  Power {simRowWatts}W ({formatRowingSplit(rowingWattsToSplitSecPer500m(simRowWatts))}/500m)
                  <input
                    id="sim-row-watts-slider"
                    type="range"
                    min={50}
                    max={450}
                    step={5}
                    value={simRowWatts}
                    onChange={(e) => setSimRowWatts(Number(e.target.value))}
                  />
                </label>
                <label className="sim-slider-label">
                  Stroke Rate {simRowStrokeRate} SPM
                  <input
                    id="sim-row-spm-slider"
                    type="range"
                    min={16}
                    max={40}
                    value={simRowStrokeRate}
                    onChange={(e) => setSimRowStrokeRate(Number(e.target.value))}
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.78rem', color: 'var(--accent-orange)' }}>
                  DEMO SIM:
                </strong>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applySimulatorEffort(0.64, 82)}
                >
                  Warm-Up (Blue)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applySimulatorEffort(0.83, 88)}
                >
                  Base (Green)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applySimulatorEffort(0.98, 94)}
                >
                  Push (Orange)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => applySimulatorEffort(1.22, 106)}
                >
                  All-Out (Red)
                </button>
              </div>

              <div className="sim-sliders tabular">
                <label className="sim-slider-label">
                  Gear {simResistance}
                  <input
                    id="sim-resistance-slider"
                    type="range"
                    min={1}
                    max={32}
                    value={simResistance}
                    onChange={(e) => setSimResistance(Number(e.target.value))}
                  />
                </label>
                <label className="sim-slider-label">
                  Cadence {simCadence} RPM
                  <input
                    id="sim-cadence-slider"
                    type="range"
                    min={45}
                    max={120}
                    value={simCadence}
                    onChange={(e) => setSimCadence(Number(e.target.value))}
                  />
                </label>
              </div>
            </>
          )}
        </section>
      )}

      {/* Main Studio Workspace: 2-Column on Phone Portrait, 3-Column on Phone Landscape / Tablet / Desktop */}
      <main
        className={`studio-workspace ${ytLayoutMode === 'split' ? 'split-youtube' : ''}`}
      >
        {ytLayoutMode === 'split' && (
          <YouTubeDeck
            layoutMode={ytLayoutMode}
            onChangeLayoutMode={setYtLayoutMode}
            currentUrl={ytUrl}
            presets={ytPresets}
            onSelectUrl={(nextUrl) => {
              setYtUrl(nextUrl);
              saveYouTubeState(nextUrl, ytPresets);
            }}
            onSavePreset={(title, url) => {
              const next = [
                ...ytPresets,
                { id: `yt-${Date.now()}`, title, videoIdOrUrl: url },
              ];
              setYtPresets(next);
              saveYouTubeState(url, next);
              showToast(`Saved "${title}" to YouTube presets!`);
            }}
            onLaunchHudPip={() => void handleLaunchHudPip()}
            isHudPipActive={isHudPipActive}
          />
        )}

        {/* Primary Color-Coded Displays in User's Chosen Tiles & Order */}
        <div
          className={`metrics-grid ${gaugeMode === 'rings' ? 'rings-mode' : 'bars-mode'}`}
          data-tile-count={renderedCockpitTiles.length}
        >
          {renderedCockpitTiles.map((tileId, idx) => {
            const slotClassName =
              gaugeMode === 'rings'
                ? idx >= 4
                  ? 'cockpit-extra-card'
                  : idx === 3
                    ? 'cockpit-slot-4'
                    : ''
                : '';
            return (
              <CockpitTile
                key={tileId}
                tileId={tileId}
                gaugeStyle={gaugeMode}
                context="main"
                slotClassName={slotClassName}
                telemetry={telemetry}
                profile={profile}
                elapsedSec={elapsedSec}
                distanceMeters={distanceMeters}
                caloriesKcal={caloriesKcal}
                avgRideWatts={avgRideWatts}
                npRideWatts={npRideWatts}
                burnPoints={burnPoints}
                burnZoneTotalSec={burnZoneTotalSec}
                hasHrStream={hasHrStream}
                hrZoneSeconds={hrZoneSeconds}
                powerZoneSeconds={powerZoneSeconds}
                powerZones={powerZones}
                cadenceZones={cadenceZones}
                hrZones={hrZones}
                activePowerZone={activePowerZone}
                activeCadenceZone={activeCadenceZone}
                activeHrZone={activeHrZone}
                activeSegmentInfo={activeSegmentInfo}
                resistanceControl={resistanceControl}
                speedControl={speedControl}
                quadStatOrder={quadStatOrder}
                arrange={makeTileArrange(tileId)}
              />
            );
          })}
        </div>
      </main>

      {/* Full Secondary Ride Telemetry Strip (Shown in 3-Column Landscape/Tablet/Desktop & Bars Mode) */}
      <section className={`secondary-strip tabular ${gaugeMode === 'rings' ? 'rings-secondary' : ''}`}>
        {layoutPrefs.secondaryStatOrder.map((statId, idx) => {
          const item = secondaryStatContent[statId];
          const isDragging = draggedControl?.group === 'stat' && draggedControl.id === statId;
          const isDragOver =
            dragOverControl?.group === 'stat' &&
            dragOverControl.id === statId &&
            draggedControl?.id !== statId;
          return (
            <div
              key={statId}
              className={`stat-tile${isArrangingLayout ? ' stat-tile-arranging' : ''}${isDragging ? ' is-dragging' : ''}${isDragOver ? ' is-drag-over' : ''}`}
              data-stat-id={statId}
              draggable={isArrangingLayout || undefined}
              onDragStart={
                isArrangingLayout
                  ? (e) => {
                      setDraggedControl({ group: 'stat', id: statId });
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', `stat:${statId}`);
                    }
                  : undefined
              }
              onDragOver={
                isArrangingLayout
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverControl?.group !== 'stat' || dragOverControl.id !== statId) {
                        setDragOverControl({ group: 'stat', id: statId });
                      }
                    }
                  : undefined
              }
              onDragLeave={
                isArrangingLayout
                  ? () => {
                      if (dragOverControl?.group === 'stat' && dragOverControl.id === statId) {
                        setDragOverControl(null);
                      }
                    }
                  : undefined
              }
              onDrop={
                isArrangingLayout
                  ? (e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData('text/plain');
                      const sourceId = (
                        draggedControl?.group === 'stat'
                          ? draggedControl.id
                          : raw.startsWith('stat:')
                            ? raw.slice(5)
                            : ''
                      ) as SecondaryStatId;
                      if (
                        sourceId &&
                        layoutPrefs.secondaryStatOrder.includes(sourceId) &&
                        sourceId !== statId
                      ) {
                        handleUpdateLayoutPrefs({
                          ...layoutPrefs,
                          secondaryStatOrder: reorderOrderItem(
                            layoutPrefs.secondaryStatOrder,
                            sourceId,
                            statId
                          ),
                        });
                      }
                      setDraggedControl(null);
                      setDragOverControl(null);
                    }
                  : undefined
              }
              onDragEnd={
                isArrangingLayout
                  ? () => {
                      setDraggedControl(null);
                      setDragOverControl(null);
                    }
                  : undefined
              }
            >
              <div className="stat-tile-head">
                <span className="stat-tile-label">{item.label}</span>
                {isArrangingLayout && (
                  <span className="stat-tile-arrows">
                    <button
                      type="button"
                      className="tile-nudge-btn"
                      disabled={idx === 0}
                      onClick={() =>
                        handleUpdateLayoutPrefs({
                          ...layoutPrefs,
                          secondaryStatOrder: moveOrderItem(
                            layoutPrefs.secondaryStatOrder,
                            statId,
                            -1
                          ),
                        })
                      }
                      aria-label={`Move ${SECONDARY_STAT_META[statId].label} earlier`}
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      className="tile-nudge-btn"
                      disabled={idx === layoutPrefs.secondaryStatOrder.length - 1}
                      onClick={() =>
                        handleUpdateLayoutPrefs({
                          ...layoutPrefs,
                          secondaryStatOrder: moveOrderItem(
                            layoutPrefs.secondaryStatOrder,
                            statId,
                            1
                          ),
                        })
                      }
                      aria-label={`Move ${SECONDARY_STAT_META[statId].label} later`}
                    >
                      <ChevronRight size={13} />
                    </button>
                  </span>
                )}
              </div>
              <span className="stat-tile-val">{item.value}</span>
              <span className="stat-tile-sub">{item.sub}</span>
            </div>
          );
        })}
      </section>

      {/* Live Garmin-Style Color-Coded Timeline Graph + 5-Zone Distribution */}
      <LiveZoneGraph
        points={
          rideState === 'idle'
            ? telemetry.isSimulating || telemetry.bikeConnected || telemetry.hrConnected
              ? previewPoints
              : []
            : trackPoints
        }
        profile={profile}
        sport={sportMode}
        hrZoneSeconds={hrZoneSeconds}
        powerZoneSeconds={powerZoneSeconds}
        hasHrStream={hasHrStream}
      />

      {/* Privacy-First Local-Only Studio Footer, Open-Source & Legal Links */}
      <footer className="studio-footer" id="studio-footer">
        <div className="studio-footer-pledge">
          <strong>100% Local-First · Open Source · No Accounts · No Paywalls — Just Be Fit.</strong>
          <span>
            Built by{' '}
            <a
              id="footer-author-link"
              href={AUTHOR_PORTFOLIO_URL}
              target="_blank"
              rel="noopener noreferrer author"
              className="studio-footer-link"
              title="John Bendfeldt — Portfolio"
            >
              John Bendfeldt
            </a>
            . Your workouts &amp; stats stay in your browser unless you choose to sync. Open source
            on GitHub — take the code, edit it yourself, or improve it.
          </span>
        </div>
        <nav className="studio-footer-links" aria-label="Open source, privacy, and legal">
          <a
            id="footer-github-link"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="studio-footer-link studio-footer-github-link"
            title="View, fork, or improve the source code on GitHub"
          >
            <GitHubMarkIcon size={13} />
            GitHub Source
          </a>
          <a
            id="footer-contact-link"
            href="mailto:dev@jbfit.studio"
            className="studio-footer-link"
            title="Email dev@jbfit.studio for support or feedback"
          >
            dev@jbfit.studio
          </a>
          <button
            type="button"
            id="open-privacy-btn"
            className="studio-footer-link"
            onClick={() => handleOpenLegalDoc('privacy')}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            id="open-terms-btn"
            className="studio-footer-link"
            onClick={() => handleOpenLegalDoc('terms')}
          >
            Terms &amp; Liability Release
          </button>
        </nav>
      </footer>

      {/* Floating YouTube Mini-Player when switched to Corner PiP Mode */}
      {ytLayoutMode === 'floating' && (
        <YouTubeDeck
          layoutMode={ytLayoutMode}
          onChangeLayoutMode={setYtLayoutMode}
          currentUrl={ytUrl}
          presets={ytPresets}
          onSelectUrl={(nextUrl) => {
            setYtUrl(nextUrl);
            saveYouTubeState(nextUrl, ytPresets);
          }}
          onSavePreset={(title, url) => {
            const next = [
              ...ytPresets,
              { id: `yt-${Date.now()}`, title, videoIdOrUrl: url },
            ];
            setYtPresets(next);
            saveYouTubeState(url, next);
          }}
          onLaunchHudPip={() => void handleLaunchHudPip()}
          isHudPipActive={isHudPipActive}
        />
      )}

      {/* Backing Offscreen Canvas & Video Stream for Native Android/Desktop System PiP HUD */}
      <canvas
        ref={hudCanvasRef}
        width={640}
        height={360}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <video
        ref={hudVideoRef}
        className="pip-backing-media"
        muted
        playsInline
        aria-hidden="true"
      />

      {/* Modals */}
      <FocusRideModal
        isOpen={isFocusModalOpen}
        onClose={handleCloseFocusMode}
        workouts={activeWorkouts}
        selectedWorkout={selectedWorkout}
        onSelectWorkoutId={(id) => {
          setSelectedWorkoutId(id);
          setSegmentOffsetSec(0);
        }}
        activeSegmentInfo={activeSegmentInfo}
        rideState={rideState}
        elapsedSec={elapsedSec}
        burnPoints={burnPoints}
        burnZoneTotalSec={burnZoneTotalSec}
        distanceMeters={distanceMeters}
        caloriesKcal={caloriesKcal}
        avgRideWatts={avgRideWatts}
        npRideWatts={npRideWatts}
        telemetry={telemetry}
        profile={profile}
        powerZones={powerZones}
        cadenceZones={cadenceZones}
        hrZones={hrZones}
        activePowerZone={activePowerZone}
        activeCadenceZone={activeCadenceZone}
        activeHrZone={activeHrZone}
        headlineZone={headlineZone}
        resistanceControl={resistanceControl}
        speedControl={speedControl}
        audioEnabled={audioEnabled}
        onToggleAudio={handleToggleAudio}
        isHudPipActive={isHudPipActive}
        onLaunchHudPip={() => void handleLaunchHudPip()}
        onStartOrResume={handleStartOrResume}
        onPause={() => setRideState('paused')}
        onSkipSegment={handleSkipSegment}
        onFinishAndSave={() => requestStopWorkoutConfirmation('save')}
        onResetWorkout={() => requestStopWorkoutConfirmation('discard')}
        hasHrStream={hasHrStream}
        hrZoneSeconds={hrZoneSeconds}
        powerZoneSeconds={powerZoneSeconds}
        tileOrder={focusTileOrder}
        quadStatOrder={quadStatOrder}
        onOpenLayoutCustomizer={() => setIsLayoutModalOpen(true)}
      />

      <CustomizeLayoutModal
        isOpen={isLayoutModalOpen}
        prefs={layoutPrefs}
        onChangePrefs={handleUpdateLayoutPrefs}
        onStartInlineArrange={
          isFocusModalOpen
            ? undefined
            : () => {
                setIsLayoutModalOpen(false);
                setIsArrangingLayout(true);
              }
        }
        onClose={() => setIsLayoutModalOpen(false)}
      />

      <AthleteProfileModal
        isOpen={isAthleteModalOpen}
        profile={profile}
        onChangeProfile={handleUpdateProfile}
        onClose={() => setIsAthleteModalOpen(false)}
      />

      <DeviceConnectionModal
        isOpen={isDeviceModalOpen}
        telemetry={telemetry}
        bleSupported={EchelonBikeConnection.isSupported()}
        onConnectBike={(acceptAllDevices) => {
          void bikeBleRef.current
            ?.requestAndConnect({ acceptAllDevices, preferredSport: sportMode })
            .catch((err: unknown) => {
              if (err instanceof Error && err.name !== 'NotFoundError') {
                showToast(err.message);
              }
            });
        }}
        onDisconnectBike={() => bikeBleRef.current?.disconnect()}
        onConnectHr={(acceptAllDevices) => {
          void hrBleRef.current
            ?.requestAndConnect({ acceptAllDevices })
            .catch((err: unknown) => {
              if (err instanceof Error && err.name !== 'NotFoundError') {
                showToast(err.message);
              }
            });
        }}
        onDisconnectHr={() => hrBleRef.current?.disconnect()}
        onToggleSimulation={() =>
          setTelemetry((prev) => ({ ...prev, isSimulating: !prev.isSimulating }))
        }
        onClose={() => setIsDeviceModalOpen(false)}
      />

      <HistoryAndStravaModal
        isOpen={isHistoryModalOpen}
        highlightedRide={highlightedRide}
        onSelectHighlightedRide={setHighlightedRide}
        rides={savedRides}
        currentFtpWatts={profile.ftpWatts}
        stravaConfig={stravaConfig}
        garminConfig={garminConfig}
        uploadingRideId={uploadingRideId}
        uploadStatusText={uploadStatusText}
        onSaveStravaConfig={(next) => {
          setStravaConfig(next);
          saveStravaConfig(next);
        }}
        onSaveGarminConfig={(next) => {
          setGarminConfig(next);
          saveGarminConfig(next);
        }}
        onImportAthleteStats={(imported: GarminImportedProfile) => {
          const current = profileRef.current;
          const nextProfile: AthleteProfile = {
            ...current,
            ...(imported.weightLbs !== undefined ? { weightLbs: imported.weightLbs } : {}),
            ...(imported.heightFeet !== undefined ? { heightFeet: imported.heightFeet } : {}),
            ...(imported.heightInches !== undefined
              ? { heightInches: imported.heightInches }
              : {}),
            ...(imported.maxHrBpm !== undefined ? { maxHrBpm: imported.maxHrBpm } : {}),
            ...(imported.restingHrBpm !== undefined
              ? { restingHrBpm: imported.restingHrBpm }
              : {}),
            ...(imported.ftpWatts !== undefined ? { ftpWatts: imported.ftpWatts } : {}),
          };
          handleUpdateProfile(nextProfile);
        }}
        onUploadRide={(ride, target) => void handleCloudUploadRide(ride, target)}
        onUpdateRideMeta={handleUpdateRideMeta}
        onSyncRemoteMeta={handleSyncRemoteMeta}
        onDownloadTcx={(ride) => downloadRideTcx(ride)}
        onDeleteRide={(id) => {
          void deleteSavedRide(id).then(async () => {
            const next = await listSavedRides();
            setSavedRides(next);
            if (highlightedRide?.id === id) setHighlightedRide(null);
          });
        }}
        onNotify={showToast}
        onClose={() => setIsHistoryModalOpen(false)}
      />

      <LegalAndPrivacyModal
        activeTab={legalDocTab}
        onSelectTab={handleOpenLegalDoc}
        onClose={handleCloseLegalDoc}
      />

      {stopConfirmAction && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1400 }}
          onClick={handleCancelStopConfirm}
          role="dialog"
          aria-modal="true"
          aria-labelledby="stop-workout-confirm-title"
          id="stop-workout-confirm-modal"
        >
          <div
            className="modal-card"
            style={{ width: 'min(440px, 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="modal-title" id="stop-workout-confirm-title">
                {stopConfirmAction === 'save' ? 'End & Save Workout?' : 'Discard Workout?'}
              </h2>
              <p className="modal-subtitle">
                {stopConfirmAction === 'save'
                  ? `Your workout is paused at ${formatDuration(elapsedSec)}${burnPoints > 0 ? ` (${burnPoints} Burn Points)` : ''}. Ready to finish and open your summary?`
                  : `Discard ${formatDuration(elapsedSec)} of workout data and reset the timer to 0:00?`}
              </p>
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                id="cancel-stop-workout-btn"
                className="btn"
                onClick={handleCancelStopConfirm}
              >
                <Play size={15} />{' '}
                {sportMode === 'running'
                  ? 'Keep Running'
                  : sportMode === 'rowing'
                    ? 'Keep Rowing'
                    : 'Keep Riding'}
              </button>
              {stopConfirmAction === 'save' ? (
                <button
                  type="button"
                  id="confirm-stop-save-btn"
                  className="btn btn-strava"
                  onClick={() => void handleFinishAndSave()}
                >
                  <Square size={15} /> End &amp; Save Workout
                </button>
              ) : (
                <button
                  type="button"
                  id="confirm-discard-workout-btn"
                  className="btn btn-danger"
                  onClick={handleResetWorkout}
                >
                  <RotateCcw size={15} /> Discard Workout
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="toast-banner" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default App;
