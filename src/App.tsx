import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bluetooth,
  FastForward,
  Flame,
  Gauge,
  History,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Rows3,
  Sliders,
  Square,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AthleteProfile,
  GarminConfig,
  GarminImportedProfile,
  LiveTelemetry,
  SavedRide,
  StravaConfig,
  TrackPoint,
  ZoneId,
} from './types/fitness';
import {
  computeNormalizedPower,
  computeWattsPerKg,
  cueDisplayLabel,
  estimateIndoorSpeedMps,
  estimateKcalPerSecond,
  formatBikeGearBadge,
  formatDuration,
  formatHeightImperial,
  getCadenceZones,
  getHrZones,
  getPowerZones,
  metersToMiles,
  mpsToMph,
  resolveHeadlineEffortZone,
  resolveZone,
} from './utils/zones';
import {
  calculateEchelonWatts,
  suggestBikeResistance,
} from './services/ble/echelonPowerCurve';
import { EchelonBikeConnection } from './services/ble/echelonBle';
import { GarminHeartRateConnection } from './services/ble/garminHrBle';
import {
  WORKOUT_TEMPLATES,
  getSegmentTargetsForAthlete,
  getTotalWorkoutDurationSec,
} from './data/workouts';
import {
  deleteSavedRide,
  listSavedRides,
  loadAthleteProfile,
  loadGarminConfig,
  loadStravaConfig,
  loadYouTubePresets,
  saveAthleteProfile,
  saveGarminConfig,
  saveRideToDb,
  saveStravaConfig,
  saveYouTubeState,
} from './services/storage';
import { downloadRideTcx } from './services/tcxExporter';
import {
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
import { enterBrowserFullscreen, exitBrowserFullscreen } from './utils/fullscreen';
import { ZoneMetricCard } from './components/ZoneMetricCard';
import { ZoneSpeedometerCard } from './components/ZoneSpeedometerCard';
import { RideStatsQuadCard } from './components/RideStatsQuadCard';
import { FocusRideModal } from './components/FocusRideModal';
import { LiveZoneGraph } from './components/LiveZoneGraph';
import { IntervalTargetCard } from './components/IntervalTargetCard';
import { ZoneTimeCard } from './components/ZoneDistributionList';
import { YouTubeDeck, type YouTubeLayoutMode } from './components/YouTubeDeck';
import { AthleteProfileModal } from './components/AthleteProfileModal';
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

const EMPTY_ZONE_SECONDS: Record<ZoneId, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const GAUGE_MODE_STORAGE_KEY = 'jbf_gauge_mode_v1';

export type GaugeDisplayMode = 'rings' | 'bars';

function loadGaugeDisplayMode(): GaugeDisplayMode {
  try {
    const saved = window.localStorage.getItem(GAUGE_MODE_STORAGE_KEY);
    return saved === 'bars' ? 'bars' : 'rings';
  } catch {
    return 'rings';
  }
}

export function App() {
  // Athlete Profile (safe starter defaults: Rider, 5'8", 165 lbs, 150W FTP, 180 Max HR)
  const [profile, setProfile] = useState<AthleteProfile>(() => loadAthleteProfile());
  const profileRef = useRef<AthleteProfile>(profile);

  // Gauge Layout Mode ('rings' 2/3-col speedometer grid vs 'bars' horizontal Garmin bars)
  const [gaugeMode, setGaugeMode] = useState<GaugeDisplayMode>(() => loadGaugeDisplayMode());

  // Workout Selection & Active Session State
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string>(WORKOUT_TEMPLATES[1].id);
  const [rideState, setRideState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number>(0);
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
  const [telemetry, setTelemetry] = useState<LiveTelemetry>({
    powerWatts: 0,
    cadenceRpm: 0,
    resistance: 18,
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
  });
  const telemetryRef = useRef<LiveTelemetry>(telemetry);

  // Simulator Controls
  const [simResistance, setSimResistance] = useState<number>(18);
  const [simCadence, setSimCadence] = useState<number>(85);
  const simCurrentHrRef = useRef<number>(122);

  // YouTube & PiP State
  const initialYt = useMemo(() => loadYouTubePresets(), []);
  const [ytLayoutMode, setYtLayoutMode] = useState<YouTubeLayoutMode>('closed');
  const [ytUrl, setYtUrl] = useState<string>(initialYt.lastUrl);
  const [ytPresets, setYtPresets] = useState(initialYt.presets);
  const [isHudPipActive, setIsHudPipActive] = useState<boolean>(false);

  // Modals, History, Cloud Sync, Legal/Privacy Route, Audio, Toast
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
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

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

  // Initialize WakeLock, Audio, IndexedDB Rides, and Strava OAuth Redirect Check
  useEffect(() => {
    wakeRef.current = new ScreenWakeManager();
    audioRef.current = new WorkoutAudioCue();

    void listSavedRides().then(setSavedRides).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get('code');
    const oauthState = params.get('state');
    if (oauthCode && oauthState === 'jb_fitness_strava_oauth') {
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
      onReading: ({ cadenceRpm, resistance, directWatts, maxResistance }) => {
        const p = profileRef.current;
        const model = bikeConn.getModelProfile();
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
          cadenceRpm,
          resistance,
          powerWatts: watts,
          speedMph: mpsToMph(speedMps),
          bikeMaxResistance: maxResistance ?? prev.bikeMaxResistance ?? 32,
        }));
      },
      onStatusChange: (status, deviceName, message, modelProfile) => {
        setTelemetry((prev) => ({
          ...prev,
          bikeStatus: status,
          bikeConnected: status === 'connected',
          bikeName: deviceName,
          bikeFamily: modelProfile?.family ?? null,
          bikeShortLabel: modelProfile?.shortLabel ?? null,
          bikeHasMotorizedResistance: modelProfile?.hasMotorizedResistance ?? false,
          bikeMaxResistance: status === 'connected' ? prev.bikeMaxResistance ?? 32 : 32,
          isSimulating: status === 'connected' ? false : prev.isSimulating,
        }));
        if (message) showToast(message);
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
  }, [showToast]);

  // Re-orient live Watts & Speed immediately whenever Athlete Profile changes
  const handleUpdateProfile = useCallback((next: AthleteProfile) => {
    setProfile(next);
    saveAthleteProfile(next);
    setTelemetry((prev) => {
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
  }, [audioEnabled]);

  // Selected Workout & Active Segment Resolution
  const selectedWorkout = useMemo(
    () => WORKOUT_TEMPLATES.find((w) => w.id === selectedWorkoutId) ?? WORKOUT_TEMPLATES[0],
    [selectedWorkoutId]
  );

  const activeSegmentInfo = (() => {
    if (selectedWorkout.isFreeRide || selectedWorkout.segments.length === 0) {
      return null;
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
          targets: getSegmentTargetsForAthlete(seg, profile, telemetry.bikeFamily),
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
      targets: getSegmentTargetsForAthlete(lastSeg, profile, telemetry.bikeFamily),
    };
  })();

  // Interactive Ride Simulator Loop (updates every 1s when enabled)
  useEffect(() => {
    if (!telemetry.isSimulating) return;

    const tickSim = () => {
      const p = profileRef.current;
      const jitter = Math.round((Math.random() - 0.5) * 3);
      const cadence = Math.max(40, simCadence + jitter);
      const watts = calculateEchelonWatts(simResistance, cadence, p.powerCurve, p.wattGain);
      const speedMps = estimateIndoorSpeedMps(watts, p);

      // Physiological HR response oriented to Athlete FTP & Max HR
      const intensityRatio = watts / Math.max(80, p.ftpWatts);
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

      setTelemetry((prev) => ({
        ...prev,
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
  }, [telemetry.isSimulating, simResistance, simCadence]);

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
        heartRateBpm: prev.hrConnected ? prev.heartRateBpm : 0,
      }));
      simCurrentHrRef.current = profileRef.current.restingHrBpm + 24;
    }
    wasSimulatingRef.current = telemetry.isSimulating;
  }, [telemetry.isSimulating]);

  // Pre-ride preview: while idle, stream live/simulated readings into a rolling buffer so the
  // timeline reacts to Simulate or a paired bike before Start. Never saved or counted in stats.
  useEffect(() => {
    if (rideState !== 'idle') return;
    if (!telemetry.isSimulating && !telemetry.bikeConnected && !telemetry.hrConnected) {
      setPreviewPoints([]);
      return;
    }
    const timer = window.setInterval(() => {
      const t = telemetryRef.current;
      const p = profileRef.current;
      if (t.powerWatts <= 0 && t.heartRateBpm <= 0) return;
      const point: TrackPoint = {
        timestampMs: Date.now(),
        elapsedSec: 0,
        powerWatts: t.powerWatts,
        cadenceRpm: t.cadenceRpm,
        resistance: t.resistance,
        heartRateBpm: t.heartRateBpm,
        speedMps: 0,
        distanceMeters: 0,
        caloriesKcal: 0,
        hrZone: resolveZone(t.heartRateBpm, getHrZones(p.maxHrBpm)).zone,
        powerZone: resolveZone(t.powerWatts, getPowerZones(p.ftpWatts)).zone,
      };
      setPreviewPoints((prev) => [...prev.slice(-239), point]);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rideState, telemetry.isSimulating, telemetry.bikeConnected, telemetry.hrConnected]);

  // 1-Second Active Workout Recording & Interval Cue Loop
  useEffect(() => {
    if (rideState !== 'running') return;

    const timer = window.setInterval(() => {
      const currTel = telemetryRef.current;
      const currProf = profileRef.current;
      const hrZ = resolveZone(currTel.heartRateBpm, getHrZones(currProf.maxHrBpm)).zone;
      const pwrZ = resolveZone(currTel.powerWatts, getPowerZones(currProf.ftpWatts)).zone;

      const speedMps = estimateIndoorSpeedMps(currTel.powerWatts, currProf);
      const kcalDelta = estimateKcalPerSecond(
        currTel.powerWatts,
        currTel.heartRateBpm,
        currProf
      );

      setElapsedSec((prevElapsed) => {
        const nextElapsed = prevElapsed + 1;

        // Play 10s heads-up, 3-2-1-GO chimes, and pre-rendered Coach Jenny MP3 prompts on interval transitions
        if (!selectedWorkout.isFreeRide && selectedWorkout.segments.length > 0) {
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

        setDistanceMeters((prevDist) => {
          const nextDist = prevDist + speedMps;
          setCaloriesKcal((prevCal) => {
            const nextCal = prevCal + kcalDelta;
            const point: TrackPoint = {
              timestampMs: Date.now(),
              elapsedSec: nextElapsed,
              powerWatts: currTel.powerWatts,
              cadenceRpm: currTel.cadenceRpm,
              resistance: currTel.resistance,
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
          return nextDist;
        });

        if (currTel.heartRateBpm > 0) {
          setHrZoneSeconds((prev) => ({ ...prev, [hrZ]: prev[hrZ] + 1 }));
        }
        setPowerZoneSeconds((prev) => ({ ...prev, [pwrZ]: prev[pwrZ] + 1 }));

        return nextElapsed;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rideState, selectedWorkout, segmentOffsetSec]);

  // Derived Burn Points (1 Burn Point per 60s in Zone 4 Orange + Zone 5 Red)
  const hasHrStream = telemetry.heartRateBpm > 0 || hrZoneSeconds[4] + hrZoneSeconds[5] > 0;
  const burnZoneTotalSec = hasHrStream
    ? hrZoneSeconds[4] + hrZoneSeconds[5]
    : powerZoneSeconds[4] + powerZoneSeconds[5];
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

  // Keep Picture-in-Picture Canvas continuously updated
  useEffect(() => {
    const canvas = hudCanvasRef.current;
    if (!canvas) return;
    renderTelemetryHudCanvas(canvas, {
      telemetry,
      profile,
      elapsedSec,
      burnPoints,
      gaugeMode,
      segmentLabel: activeSegmentInfo?.segment.label,
      segmentRemainingSec: activeSegmentInfo?.remainingSec,
    });
  }, [telemetry, profile, elapsedSec, burnPoints, gaugeMode, activeSegmentInfo]);

  // Launch Picture-in-Picture Floating HUD (works over YouTube App on Android/Desktop)
  const handleLaunchHudPip = useCallback(async () => {
    const canvas = hudCanvasRef.current;
    const video = hudVideoRef.current;
    if (!canvas || !video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsHudPipActive(false);
        return;
      }

      renderTelemetryHudCanvas(canvas, {
        telemetry: telemetryRef.current,
        profile: profileRef.current,
        elapsedSec,
        burnPoints,
        gaugeMode,
        segmentLabel: activeSegmentInfo?.segment.label,
        segmentRemainingSec: activeSegmentInfo?.remainingSec,
      });

      if (!hudStreamAttachedRef.current) {
        const stream = canvas.captureStream(10);
        video.srcObject = stream;
        hudStreamAttachedRef.current = true;
      }

      await video.play();

      if ('requestPictureInPicture' in video) {
        await video.requestPictureInPicture();
        setIsHudPipActive(true);
        showToast('Telemetry HUD popped out! Open YouTube and ride along.');
      } else {
        showToast(
          'Use the built-in YouTube Split/Corner player on this device, or enable PiP in Chrome settings.'
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not open system PiP window — try the built-in YouTube Split/Corner player!';
      showToast(msg);
    }
  }, [elapsedSec, burnPoints, gaugeMode, activeSegmentInfo, showToast]);

  useEffect(() => {
    const video = hudVideoRef.current;
    if (!video) return;
    const onLeave = () => setIsHudPipActive(false);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => video.removeEventListener('leavepictureinpicture', onLeave);
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
    if (!activeSegmentInfo) return;
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
    audioRef.current?.stopVoice();
    lastAnnouncedBurnRef.current = 0;
    setRideState('idle');
    setElapsedSec(0);
    setSegmentOffsetSec(0);
    setStartedAtMs(null);
    setDistanceMeters(0);
    setCaloriesKcal(0);
    setHrZoneSeconds({ ...EMPTY_ZONE_SECONDS });
    setPowerZoneSeconds({ ...EMPTY_ZONE_SECONDS });
    setTrackPoints([]);
  };

  const handleFinishAndSave = async () => {
    setRideState('idle');
    if (elapsedSec < 5 || trackPoints.length === 0) {
      handleResetWorkout();
      showToast('Ride was under 5 seconds — reset without saving.');
      return;
    }

    const wattsArr = trackPoints.map((p) => p.powerWatts);
    const cadArr = trackPoints.map((p) => p.cadenceRpm);
    const resArr = trackPoints.map((p) => p.resistance);
    const hrArr = trackPoints.map((p) => p.heartRateBpm).filter((h) => h > 0);

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

    const bikeLabel = telemetry.bikeConnected
      ? bikeBleRef.current?.getModelProfile()?.displayName || telemetry.bikeName || 'Indoor Bike'
      : 'Indoor Bike';

    const ride: SavedRide = {
      id: `ride-${Date.now()}`,
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
      avgHr,
      maxHr,
      athleteSnapshot: { ...profile },
      hrZoneSeconds: { ...hrZoneSeconds },
      powerZoneSeconds: { ...powerZoneSeconds },
      trackPoints: [...trackPoints],
    };

    await saveRideToDb(ride);
    const updatedList = await listSavedRides();
    setSavedRides(updatedList);
    setHighlightedRide(ride);
    setIsHistoryModalOpen(true);
    handleResetWorkout();
  };

  // Simulator Effort Preset Helper (orients directly to Athlete's FTP)
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

  // Resistance +/- Stepper Handler (works on motorized BLE bikes, cadence-pod virtual gear, and Simulator)
  const adjustResistance = (delta: number) => {
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
      let updatedRide: SavedRide = { ...ride };
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
      if (highlightedRide?.id === ride.id) {
        setHighlightedRide(updatedRide);
      }

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
    await saveRideToDb(updatedRide);
    const nextList = await listSavedRides();
    setSavedRides(nextList);
    if (highlightedRide?.id === updatedRide.id) {
      setHighlightedRide(updatedRide);
    }
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

  // Live Zone Computations Oriented to Athlete Profile
  const hrZones = useMemo(() => getHrZones(profile.maxHrBpm), [profile.maxHrBpm]);
  const powerZones = useMemo(() => getPowerZones(profile.ftpWatts), [profile.ftpWatts]);
  const cadenceZones = useMemo(() => getCadenceZones(), []);

  const activeHrZone = resolveZone(telemetry.heartRateBpm, hrZones);
  const activePowerZone = resolveZone(telemetry.powerWatts, powerZones);
  const activeCadenceZone = resolveZone(telemetry.cadenceRpm, cadenceZones);
  const { zoneDef: headlineZone } = resolveHeadlineEffortZone(
    telemetry.heartRateBpm,
    telemetry.powerWatts,
    profile
  );

  const liveWkg = computeWattsPerKg(telemetry.powerWatts, profile.weightLbs);
  const ftpPct =
    profile.ftpWatts > 0 ? Math.round((telemetry.powerWatts / profile.ftpWatts) * 100) : 0;
  const hrPct =
    profile.maxHrBpm > 0 && telemetry.heartRateBpm > 0
      ? Math.round((telemetry.heartRateBpm / profile.maxHrBpm) * 100)
      : 0;

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

  const isAnySensorLive =
    telemetry.powerWatts > 0 || telemetry.heartRateBpm > 0 || rideState === 'running';

  const showResistanceStepper =
    !telemetry.bikeConnected ||
    Boolean(telemetry.bikeHasMotorizedResistance) ||
    telemetry.bikeFamily === 'cadence-bike';

  const resistanceControl = showResistanceStepper ? (
    <div className="resistance-stepper">
      <button
        type="button"
        id="resistance-dec-btn"
        className="stepper-btn"
        onClick={() => adjustResistance(-1)}
        aria-label="Decrease resistance"
      >
        −
      </button>
      <button
        type="button"
        id="resistance-inc-btn"
        className="stepper-btn"
        onClick={() => adjustResistance(1)}
        aria-label="Increase resistance"
      >
        +
      </button>
    </div>
  ) : null;

  const ActiveGaugeComponent = gaugeMode === 'rings' ? ZoneSpeedometerCard : ZoneMetricCard;

  return (
    <div
      className={`app-shell mode-${gaugeMode}${ytLayoutMode === 'split' ? ' yt-split' : ''}`}
    >
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
          <div>
            <h1 className="brand-title">Just Believe Fitness</h1>
            <div className="brand-sub">Indoor Cycling Studio · Any Bike &amp; BLE HR</div>
          </div>
        </div>

        {/* Athlete Quick-Input Orientation Button */}
        <button
          type="button"
          id="athlete-stats-chip"
          className="athlete-chip"
          onClick={() => setIsAthleteModalOpen(true)}
          title="Click to edit height, weight, FTP, and Max HR"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={14} color="var(--accent-orange)" />
            <span className="athlete-chip-label">{profile.name}</span>
          </span>
          <span className="athlete-chip-stats tabular">
            {formatHeightImperial(profile.heightFeet, profile.heightInches)} · {profile.weightLbs}# ·{' '}
            {profile.ftpWatts}W FTP · {profile.maxHrBpm} HR
          </span>
        </button>

        <div className="topbar-actions">
          <button
            type="button"
            id="open-sensors-btn"
            className="btn btn-sm"
            onClick={() => setIsDeviceModalOpen(true)}
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
                ? `${telemetry.bikeShortLabel || 'Bike'} + HR`
                : `${telemetry.bikeShortLabel || 'Bike'} Connected`
              : telemetry.hrConnected
                ? telemetry.hrName || 'HR Connected'
                : 'Pair Sensors'}
          </button>

          <button
            type="button"
            id="toggle-youtube-btn"
            className={`btn btn-sm ${ytLayoutMode !== 'closed' ? 'btn-primary' : ''}`}
            onClick={() =>
              setYtLayoutMode((curr) => (curr === 'closed' ? 'split' : 'closed'))
            }
          >
            <Tv size={15} /> YouTube
          </button>

          <button
            type="button"
            id="topbar-hud-pip-btn"
            className={`btn btn-sm ${isHudPipActive ? 'btn-primary' : ''}`}
            onClick={() => void handleLaunchHudPip()}
            title="Pop out floating Power/Cadence/HR gauges over YouTube"
          >
            <PictureInPicture2 size={15} /> HUD PiP
          </button>

          <button
            type="button"
            id="toggle-sim-quick-btn"
            className={`btn btn-sm ${telemetry.isSimulating ? 'btn-primary' : ''}`}
            onClick={() =>
              setTelemetry((prev) => ({ ...prev, isSimulating: !prev.isSimulating }))
            }
          >
            {telemetry.isSimulating ? 'Sim Live' : 'Simulate'}
          </button>

          <button
            type="button"
            id="open-history-btn"
            className="btn btn-sm"
            onClick={() => {
              setHighlightedRide(null);
              setIsHistoryModalOpen(true);
            }}
          >
            <History size={15} /> Rides &amp; Sync ({savedRides.length})
          </button>
        </div>
      </header>

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
              <>
                <strong>{cueDisplayLabel(activeSegmentInfo.segment.cue)}:</strong>{' '}
                {activeSegmentInfo.segment.label} ({activeSegmentInfo.targets.minWatts}–
                {activeSegmentInfo.targets.maxWatts}W · ~Res{' '}
                {activeSegmentInfo.targets.suggestedResistanceLow}–
                {activeSegmentInfo.targets.suggestedResistanceHigh})
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
          {activeSegmentInfo && (
            <div className="ribbon-stat">
              <span className="ribbon-stat-label">Interval Left</span>
              <span className="ribbon-stat-val">
                {formatDuration(activeSegmentInfo.remainingSec)}
              </span>
            </div>
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

      {/* Workout Selector, Gauge Style Switcher (Rings vs Bars), & Transport Bar */}
      <section className="workout-strip">
        <div className="workout-picker-group">
          <select
            id="workout-template-select"
            className="workout-select"
            value={selectedWorkoutId}
            onChange={(e) => {
              setSelectedWorkoutId(e.target.value);
              setSegmentOffsetSec(0);
            }}
          >
            {WORKOUT_TEMPLATES.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {!w.isFreeRide
                  ? ` (${Math.round(getTotalWorkoutDurationSec(w) / 60)} min)`
                  : ''}
              </option>
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
                <strong>Block {activeSegmentInfo.index + 1}/{activeSegmentInfo.totalSegments}:</strong>{' '}
                {activeSegmentInfo.segment.coachingNote}
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
              <span>Open Ride · Tap Focus for full-screen 4-grid cockpit</span>
              <Maximize2 size={13} style={{ flexShrink: 0, opacity: 0.75 }} />
            </button>
          )}
        </div>

        <div className="transport-controls">
          {/* Speedometer Ring Grid vs Horizontal Bars Switcher */}
          <div className="gauge-toggle-group" role="group" aria-label="Gauge display style">
            <button
              type="button"
              id="gauge-mode-rings-btn"
              className={`gauge-toggle-btn ${gaugeMode === 'rings' ? 'active' : ''}`}
              onClick={() => handleSelectGaugeMode('rings')}
              title="Compact 2/3-column Speedometer Ring Grid"
            >
              <Gauge size={14} /> Rings
            </button>
            <button
              type="button"
              id="gauge-mode-bars-btn"
              className={`gauge-toggle-btn ${gaugeMode === 'bars' ? 'active' : ''}`}
              onClick={() => handleSelectGaugeMode('bars')}
              title="Horizontal Segmented Zone Bars"
            >
              <Rows3 size={14} /> Bars
            </button>
          </div>

          <button
            type="button"
            id="open-focus-mode-btn"
            className="btn btn-sm focus-launch-btn"
            onClick={handleOpenFocusMode}
            title="Enter Full-Screen Focused 4-Grid Cockpit with Workout Instructions & Play/Pause"
          >
            <Maximize2 size={14} /> Focus
          </button>

          {rideState !== 'running' ? (
            <button
              type="button"
              id="start-ride-btn"
              className="btn btn-primary"
              onClick={handleStartOrResume}
            >
              <Play size={16} /> {rideState === 'paused' ? 'Resume' : 'Start'}
            </button>
          ) : (
            <button
              type="button"
              id="pause-ride-btn"
              className="btn"
              onClick={() => setRideState('paused')}
            >
              <Pause size={16} /> Pause
            </button>
          )}

          {activeSegmentInfo && activeSegmentInfo.nextSegment && rideState !== 'idle' && (
            <button
              type="button"
              id="skip-segment-btn"
              className="btn btn-sm"
              onClick={handleSkipSegment}
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
                onClick={() => void handleFinishAndSave()}
              >
                <Square size={15} /> Save
              </button>
              <button
                type="button"
                id="reset-ride-btn"
                className="btn btn-sm"
                onClick={handleResetWorkout}
                title="Discard & reset timer"
              >
                <RotateCcw size={15} />
              </button>
            </>
          )}

          <button
            type="button"
            id="toggle-audio-cues-btn"
            className="btn btn-sm"
            onClick={() => {
              audioRef.current?.unlock();
              setAudioEnabled((v) => !v);
            }}
            title={audioEnabled ? 'Mute coach voice & chimes' : 'Enable coach voice & chimes'}
          >
            {audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        </div>
      </section>

      {/* Interactive Simulator Controls when Simulating */}
      {telemetry.isSimulating && (
        <section className="sim-bar" id="simulator-controls-bar">
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

        {/* Primary Color-Coded Displays: Power, Cadence + Bike Gear, Heart Rate (+ 4th All-Stats Tile in 2-col Portrait/Split) */}
        <div className={`metrics-grid ${gaugeMode === 'rings' ? 'rings-mode' : 'bars-mode'}`}>
          <ActiveGaugeComponent
            id="power-metric-card"
            title="Power"
            valueDisplay={`${Math.round(telemetry.powerWatts)}`}
            unit="Watts"
            primaryBadge={`${ftpPct}% FTP · ${liveWkg.toFixed(2)} W/kg`}
            secondarySub={`FTP ${profile.ftpWatts}W (${profile.weightLbs}#)`}
            zones={powerZones}
            numericValue={telemetry.powerWatts}
            activeZone={activePowerZone}
            thresholdUnitSuffix="W"
          />

          <ActiveGaugeComponent
            id="cadence-metric-card"
            title="Cadence"
            valueDisplay={`${Math.round(telemetry.cadenceRpm)}`}
            unit="RPM"
            primaryBadge={formatBikeGearBadge(telemetry)}
            secondarySub={
              activeSegmentInfo
                ? `Target ${activeSegmentInfo.segment.cadenceRange[0]}–${activeSegmentInfo.segment.cadenceRange[1]}`
                : 'Spin Rhythm'
            }
            zones={cadenceZones}
            numericValue={telemetry.cadenceRpm}
            activeZone={activeCadenceZone}
            extraControl={resistanceControl}
          />

          <ActiveGaugeComponent
            id="hr-metric-card"
            title="Heart Rate"
            valueDisplay={
              telemetry.heartRateBpm > 0 ? `${Math.round(telemetry.heartRateBpm)}` : '--'
            }
            unit="BPM"
            primaryBadge={
              telemetry.heartRateBpm > 0
                ? `${hrPct}% MAX HR`
                : telemetry.hrName || 'BLE HR Ready'
            }
            secondarySub={`Max ${profile.maxHrBpm} · Burn ≥ ${hrZones[3].minValue}`}
            zones={hrZones}
            numericValue={telemetry.heartRateBpm}
            activeZone={activeHrZone}
          />

          {/* In 2-column layouts (Phone Portrait & Split YouTube), Cell #4 packs Speed, Distance, Calories, Avg W, & Burn Time right beside Heart Rate so ALL stats sit in one 2x2 view */}
          {gaugeMode === 'rings' && (
            <RideStatsQuadCard
              className="compact-telemetry-quad"
              speedMph={telemetry.speedMph}
              distanceMeters={distanceMeters}
              caloriesKcal={caloriesKcal}
              avgRideWatts={avgRideWatts}
              npRideWatts={npRideWatts}
              burnPoints={burnPoints}
              burnZoneTotalSec={burnZoneTotalSec}
            />
          )}

          {/* Cells #5 & #6 fill the second row beside Ride Stats (hidden in Split YouTube / compact layouts via CSS) */}
          {gaugeMode === 'rings' && ytLayoutMode !== 'split' && (
            <>
              <IntervalTargetCard className="cockpit-extra-card" info={activeSegmentInfo} />
              <ZoneTimeCard
                className="cockpit-extra-card"
                hasHrStream={hasHrStream}
                zoneSeconds={hasHrStream ? hrZoneSeconds : powerZoneSeconds}
              />
            </>
          )}
        </div>
      </main>

      {/* Full Secondary Ride Telemetry Strip (Shown in 3-Column Landscape/Tablet/Desktop & Bars Mode) */}
      <section className={`secondary-strip tabular ${gaugeMode === 'rings' ? 'rings-secondary' : ''}`}>
        <div className="stat-tile">
          <span className="stat-tile-label">Virtual Speed</span>
          <span className="stat-tile-val">{telemetry.speedMph.toFixed(1)} mph</span>
          <span className="stat-tile-sub">
            Aero {formatHeightImperial(profile.heightFeet, profile.heightInches)} ·{' '}
            {profile.weightLbs}#
          </span>
        </div>

        <div className="stat-tile">
          <span className="stat-tile-label">Distance</span>
          <span className="stat-tile-val">{metersToMiles(distanceMeters).toFixed(2)} mi</span>
          <span className="stat-tile-sub">{(distanceMeters / 1000).toFixed(2)} km</span>
        </div>

        <div className="stat-tile">
          <span className="stat-tile-label">Active Calories</span>
          <span className="stat-tile-val">{Math.round(caloriesKcal)} kcal</span>
          <span className="stat-tile-sub">Power &amp; HR calibrated</span>
        </div>

        <div className="stat-tile">
          <span className="stat-tile-label">Avg / NP Power</span>
          <span className="stat-tile-val">
            {avgRideWatts}W / {npRideWatts}W
          </span>
          <span className="stat-tile-sub">
            {computeWattsPerKg(avgRideWatts, profile.weightLbs).toFixed(2)} Avg W/kg
          </span>
        </div>

        <div className="stat-tile">
          <span className="stat-tile-label">Burn Zone Time</span>
          <span className="stat-tile-val">{formatDuration(burnZoneTotalSec)}</span>
          <span className="stat-tile-sub">{burnPoints} Burn pts earned</span>
        </div>
      </section>

      {/* Live Garmin-Style Color-Coded Timeline Graph + 5-Zone Distribution */}
      <LiveZoneGraph
        points={rideState === 'idle' ? previewPoints : trackPoints}
        profile={profile}
        hrZoneSeconds={hrZoneSeconds}
        powerZoneSeconds={powerZoneSeconds}
        hasHrStream={hasHrStream}
      />

      {/* Privacy-First Local-Only Studio Footer & Legal Links */}
      <footer className="studio-footer" id="studio-footer">
        <div className="studio-footer-pledge">
          <strong>100% Local-First · No Accounts · No Paywalls — Just Be Fit.</strong>
          <span>Your workouts &amp; stats stay in your browser unless you choose to sync.</span>
        </div>
        <nav className="studio-footer-links" aria-label="Privacy and legal">
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
        workouts={WORKOUT_TEMPLATES}
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
        audioEnabled={audioEnabled}
        onToggleAudio={() => {
          audioRef.current?.unlock();
          setAudioEnabled((v) => !v);
        }}
        isHudPipActive={isHudPipActive}
        onLaunchHudPip={() => void handleLaunchHudPip()}
        onStartOrResume={handleStartOrResume}
        onPause={() => setRideState('paused')}
        onSkipSegment={handleSkipSegment}
        onFinishAndSave={() => void handleFinishAndSave()}
        onResetWorkout={handleResetWorkout}
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
            ?.requestAndConnect({ acceptAllDevices })
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

      {toastMsg && (
        <div className="toast-banner" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default App;
