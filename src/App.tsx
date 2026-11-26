import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Coins,
  Fish,
  Flame,
  Gem,
  Gift,
  HelpCircle,
  Menu,
  Monitor,
  MousePointerClick,
  Music,
  Play,
  Plus,
  Scissors,
  ShoppingBag,
  Sparkles,
  Tag,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { GameModals } from './components/GameModals';
import { soundEngine } from './game/audio';
import {
  BOARD_SIZE,
  BOARD_THEMES,
  CAT_QUIPS,
  CAT_TIERS,
  DAILY_MISSIONS,
  DAILY_REWARDS,
  MISSIONS,
  formatCoins,
  getCatPurchasePrice,
  getPendingGoldenFish,
  getUpgradeCost,
} from './game/catData';
import {
  initYandexSdk,
  notifyGameplayStart,
  notifyGameplayStop,
  notifyYandexLoadingReady,
  safeLoadStorage,
  safeSaveStorage,
  showYandexFullscreenAd,
  showYandexRewardedVideo,
} from './game/portalBridge';
import { SceneController } from './game/SceneController';
import {
  ActiveModal,
  AsmrToyMode,
  BoardSlot,
  BoardThemeId,
  FloatingEvent,
  GameState,
  RewardedAdOffer,
  WheelSector,
} from './game/types';

const STORAGE_KEY = 'neko_merge_dx_save_v1';

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function todayKey(): string {
  return new Date().toDateString();
}

function emptyDailyProgress() {
  return { merges: 0, crates: 0, taps: 0, asmr: 0, ads: 0 };
}

function ensureDailyReset(state: GameState): GameState {
  const key = todayKey();
  if (state.dailyDateKey === key && state.dailyProgress) {
    return state;
  }
  return {
    ...state,
    dailyDateKey: key,
    dailyProgress: emptyDailyProgress(),
    dailyClaimedIds: [],
    dailyChestClaimed: false,
  };
}

function createInitialState(keepMeta?: Partial<GameState>): GameState {
  const board: (BoardSlot | null)[] = Array(BOARD_SIZE).fill(null);
  board[5] = { index: 5, kind: 'cat', level: 1, id: uid() };
  board[6] = { index: 6, kind: 'cat', level: 1, id: uid() };
  board[9] = { index: 9, kind: 'cat', level: 2, id: uid() };
  board[10] = { index: 10, kind: 'crate', level: 1, id: uid() };

  return {
    coins: 120,
    gems: keepMeta?.gems ?? 25,
    goldenFish: keepMeta?.goldenFish ?? 0,
    spinTickets: keepMeta?.spinTickets ?? 1,
    streakDay: keepMeta?.streakDay ?? 0,
    lastDailyClaimAt: keepMeta?.lastDailyClaimAt ?? 0,
    totalMerges: keepMeta?.totalMerges ?? 0,
    totalTaps: keepMeta?.totalTaps ?? 0,
    totalCratesOpened: keepMeta?.totalCratesOpened ?? 0,
    totalMiceCaught: keepMeta?.totalMiceCaught ?? 0,
    totalAsmrSlices: keepMeta?.totalAsmrSlices ?? 0,
    highestUnlockedLevel: 2,
    discoveredRewardsClaimed: [1],
    board,
    purchasesPerLevel: {},
    upgrades: {
      spawnLevel: 1,
      incomeMultiplierLevel: 1,
      crateSpeedLevel: 1,
    },
    claimedMissions: keepMeta?.claimedMissions ?? [],
    dailyDateKey: keepMeta?.dailyDateKey ?? todayKey(),
    dailyProgress: keepMeta?.dailyProgress ?? emptyDailyProgress(),
    dailyClaimedIds: keepMeta?.dailyClaimedIds ?? [],
    dailyChestClaimed: keepMeta?.dailyChestClaimed ?? false,
    autoMergeCharges: keepMeta?.autoMergeCharges ?? 2,
    doubleIncomeUntil: 0,
    tripleIncomeUntil: 0,
    fishRainUntil: 0,
    zoomiesUntil: 0,
    flashSaleUntil: 0,
    feverProgress: 0,
    feverUntil: 0,
    themeId: keepMeta?.themeId ?? 'ps2_silver',
    asmrMode: keepMeta?.asmrMode ?? 'soap',
    tutorialStep: keepMeta?.tutorialStep ?? 0,
    ps2Filter: keepMeta?.ps2Filter ?? false,
    muted: keepMeta?.muted ?? false,
    ambientEnabled: keepMeta?.ambientEnabled ?? true,
    vipPackOwned: keepMeta?.vipPackOwned ?? false,
    lastSavedAt: Date.now(),
  };
}

function loadState(): GameState {
  try {
    const raw = safeLoadStorage(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<GameState>;
    const base = createInitialState();
    return ensureDailyReset({
      ...base,
      ...parsed,
      upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
      dailyProgress: { ...base.dailyProgress, ...(parsed.dailyProgress || {}) },
      board:
        Array.isArray(parsed.board) && parsed.board.length === BOARD_SIZE
          ? parsed.board
          : base.board,
    });
  } catch {
    return createInitialState();
  }
}

function computeBaseIncomePerSec(state: GameState): number {
  let sum = 0;
  for (const slot of state.board) {
    if (slot && slot.kind === 'cat') {
      const tier = CAT_TIERS[Math.max(0, Math.min(CAT_TIERS.length - 1, slot.level - 1))];
      sum += tier.incomePerSec;
    }
  }
  const upgradeMult = 1 + (state.upgrades.incomeMultiplierLevel - 1) * 0.25;
  const prestigeMult = 1 + (state.goldenFish || 0) * 0.5;
  return sum * upgradeMult * prestigeMult;
}

export default function App() {
  const [state, setState] = useState<GameState>(() => loadState());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [offlineCoins, setOfflineCoins] = useState(0);
  const [adOffer, setAdOffer] = useState<RewardedAdOffer | null>(null);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [floatingEvents, setFloatingEvents] = useState<FloatingEvent[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [webglLost, setWebglLost] = useState(false);

  // Live Combo Chain State
  const [comboCount, setComboCount] = useState(0);
  const [comboExpiresAt, setComboExpiresAt] = useState(0);
  const comboRef = useRef({ count: 0, expiresAt: 0 });

  // Live Crate Process Visualization + Cooldowns
  const [crateProgressPct, setCrateProgressPct] = useState(0);
  const [crateSecondsLeft, setCrateSecondsLeft] = useState(8);
  const crateElapsedRef = useRef(0);
  const [crateFrenzyReadyAt, setCrateFrenzyReadyAt] = useState(0);
  const [strayCatOfferUntil, setStrayCatOfferUntil] = useState(0);
  const lastEventRef = useRef<string>('');

  // Live Golden Mouse Banner State
  const [mouseOnBoard, setMouseOnBoard] = useState(false);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneController | null>(null);
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;

  const adPausedRef = useRef(false);
  const hiddenPausedRef = useRef(false);
  const hardPausedRef = useRef(false);
  const gameStartedAtRef = useRef<number>(Date.now());
  const lastInterstitialAtRef = useRef<number>(0);

  const syncHardPause = useCallback(() => {
    const paused = adPausedRef.current || hiddenPausedRef.current;
    hardPausedRef.current = paused;
    soundEngine.setBackgroundPaused(paused);
    sceneRef.current?.setPaused(paused);
  }, []);

  const showInterstitialWithCooldown = useCallback(async () => {
    const now = Date.now();
    if (now - gameStartedAtRef.current < 60000) {
      return;
    }
    if (lastInterstitialAtRef.current > 0 && now - lastInterstitialAtRef.current < 120000) {
      return;
    }
    lastInterstitialAtRef.current = now;
    await showYandexFullscreenAd((paused) => {
      adPausedRef.current = paused;
      syncHardPause();
    });
  }, [syncHardPause]);

  const pushFloating = useCallback(
    (
      text: string,
      x: number,
      y: number,
      tone: FloatingEvent['tone'] = 'coin',
      subtext?: string,
    ) => {
      const id = uid();
      setFloatingEvents((prev) => [...prev.slice(-12), { id, text, subtext, x, y, tone }]);
      window.setTimeout(() => {
        setFloatingEvents((prev) => prev.filter((item) => item.id !== id));
      }, 950);
    },
    [],
  );

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 2600);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  // Unlock Web Audio Ambient & handle tab visibility pause/resume
  useEffect(() => {
    const handleFirstGesture = () => {
      soundEngine.unlockAudio();
    };
    const handleVisibility = () => {
      const hidden = document.hidden;
      hiddenPausedRef.current = hidden;
      syncHardPause();
      if (hidden) {
        notifyGameplayStop();
      } else {
        notifyGameplayStart();
      }
    };

    window.addEventListener('pointerdown', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncHardPause]);

  // Hard pause audio + 3D scene while local fallback ad modal is open
  useEffect(() => {
    const isAdModal = activeModal === 'ad';
    adPausedRef.current = isAdModal;
    syncHardPause();
    if (isAdModal) {
      notifyGameplayStop();
    } else {
      notifyGameplayStart();
    }
  }, [activeModal, syncHardPause]);

  // Check offline earnings once on mount
  useEffect(() => {
    const savedAt = state.lastSavedAt || Date.now();
    const elapsedSec = Math.min(3600 * 4, Math.floor((Date.now() - savedAt) / 1000));
    if (elapsedSec >= 20) {
      const rate = computeBaseIncomePerSec(state);
      const earned = Math.floor(rate * elapsedSec * 0.5);
      if (earned > 10) {
        setOfflineCoins(earned);
        setActiveModal('offline');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist state safely (with iframe/portal storage fallback)
  useEffect(() => {
    try {
      const toSave: GameState = { ...state, lastSavedAt: Date.now() };
      safeSaveStorage(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // ignore serialization errors
    }
  }, [state]);

  useEffect(() => {
    soundEngine.setMuted(state.muted);
  }, [state.muted]);

  useEffect(() => {
    soundEngine.setAmbientEnabled(state.ambientEnabled);
  }, [state.ambientEnabled]);

  // Derived rates & multipliers
  const doubleActive = state.doubleIncomeUntil > nowMs;
  const tripleActive = state.tripleIncomeUntil > nowMs;
  const fishRainActive = state.fishRainUntil > nowMs;
  const zoomiesActive = state.zoomiesUntil > nowMs;
  const flashSaleActive = state.flashSaleUntil > nowMs;
  const feverActive = state.feverUntil > nowMs;
  const comboActive = comboCount >= 2 && comboExpiresAt > nowMs;
  const globalMultiplier =
    (doubleActive ? 2 : 1) *
    (tripleActive ? 3 : 1) *
    (feverActive ? 2 : 1) *
    (fishRainActive ? 2.5 : 1) *
    (zoomiesActive ? 2 : 1);

  const incomePerSec = useMemo(
    () => computeBaseIncomePerSec(state) * globalMultiplier,
    [state, globalMultiplier],
  );

  const activeTheme = useMemo(
    () => BOARD_THEMES.find((t) => t.id === state.themeId) || BOARD_THEMES[0],
    [state.themeId],
  );
  const isDark = activeTheme.uiDark;

  const canClaimDaily = useMemo(() => {
    if (!state.lastDailyClaimAt) return true;
    const lastDay = new Date(state.lastDailyClaimAt).toDateString();
    const today = new Date(nowMs).toDateString();
    return lastDay !== today;
  }, [state.lastDailyClaimAt, nowMs]);

  // Initialize Three.js SceneController once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const controller = new SceneController(mount, stateRef.current.themeId, {
      onSlotTap: (index, screenPos) => {
        const cur = stateRef.current;
        const slot = cur.board[index];
        if (!slot) return;

        if (slot.kind === 'crate') {
          const bonusLevel =
            Math.random() < 0.22 && cur.upgrades.spawnLevel < 11
              ? cur.upgrades.spawnLevel + 1
              : cur.upgrades.spawnLevel;
          soundEngine.playMerge(bonusLevel, 1);
          controller.triggerMergeEffect(index, bonusLevel);
          setState((prev) => {
            const base = ensureDailyReset(prev);
            const nextBoard = [...base.board];
            nextBoard[index] = {
              index,
              kind: 'cat',
              level: bonusLevel,
              id: uid(),
            };
            return {
              ...base,
              board: nextBoard,
              totalCratesOpened: base.totalCratesOpened + 1,
              dailyProgress: {
                ...base.dailyProgress,
                crates: base.dailyProgress.crates + 1,
              },
              highestUnlockedLevel: Math.max(base.highestUnlockedLevel, bonusLevel),
              tutorialStep: base.tutorialStep === 1 ? 2 : base.tutorialStep,
            };
          });
          pushFloating(
            `Ур. ${bonusLevel}!`,
            screenPos.x,
            screenPos.y,
            'merge',
            CAT_TIERS[bonusLevel - 1]?.name,
          );
          return;
        }

        // Petting a cat drops bonus coins + witty cat quip!
        const tier = CAT_TIERS[Math.max(0, Math.min(CAT_TIERS.length - 1, slot.level - 1))];
        const tapCoins = Math.max(2, Math.round(tier.incomePerSec * 1.4));
        soundEngine.playMeow(slot.level);
        controller.triggerTapBounce(index);
        const showQuip = Math.random() < 0.35;
        const quip = showQuip
          ? CAT_QUIPS[Math.floor(Math.random() * CAT_QUIPS.length)]
          : undefined;

        setState((prev) => {
          const base = ensureDailyReset(prev);
          return {
            ...base,
            coins: base.coins + tapCoins,
            totalTaps: base.totalTaps + 1,
            dailyProgress: {
              ...base.dailyProgress,
              taps: base.dailyProgress.taps + 1,
            },
          };
        });
        pushFloating(`+${formatCoins(tapCoins)}`, screenPos.x, screenPos.y, 'coin', quip);
      },
      onSlotMoveOrMerge: (fromIndex, toIndex, screenPos) => {
        const cur = stateRef.current;
        const fromSlot = cur.board[fromIndex];
        const toSlot = cur.board[toIndex];
        if (!fromSlot || fromSlot.kind !== 'cat') return;

        // Empty target -> move
        if (!toSlot) {
          soundEngine.playDrop();
          setState((prev) => {
            const nextBoard = [...prev.board];
            const moved = nextBoard[fromIndex];
            if (!moved) return prev;
            nextBoard[fromIndex] = null;
            nextBoard[toIndex] = { ...moved, index: toIndex };
            return { ...prev, board: nextBoard };
          });
          return;
        }

        // Matching cat level -> COMBO MERGE!
        if (toSlot.kind === 'cat' && toSlot.level === fromSlot.level && fromSlot.level < 12) {
          const newLevel = fromSlot.level + 1;
          const now = Date.now();
          const nextCombo =
            comboRef.current.expiresAt > now
              ? Math.min(5, comboRef.current.count + 1)
              : 1;
          const nextExp = now + 4500;
          comboRef.current = { count: nextCombo, expiresAt: nextExp };
          setComboCount(nextCombo);
          setComboExpiresAt(nextExp);

          const mergeReward = newLevel * 18 * nextCombo;
          soundEngine.playMerge(newLevel, nextCombo);
          controller.triggerMergeEffect(toIndex, newLevel);

          const isNewBreed = newLevel > cur.highestUnlockedLevel;

          setState((prev) => {
            const base = ensureDailyReset(prev);
            const nextBoard = [...base.board];
            nextBoard[fromIndex] = null;
            nextBoard[toIndex] = {
              index: toIndex,
              kind: 'cat',
              level: newLevel,
              id: uid(),
            };

            const feverGain = 18 + nextCombo * 4;
            const nextFever = base.feverUntil > now ? 100 : base.feverProgress + feverGain;
            const triggeredFever = nextFever >= 100 && base.feverUntil <= now;
            if (triggeredFever) {
              soundEngine.playFever();
            }

            return {
              ...base,
              coins: base.coins + mergeReward,
              totalMerges: base.totalMerges + 1,
              dailyProgress: {
                ...base.dailyProgress,
                merges: base.dailyProgress.merges + 1,
              },
              highestUnlockedLevel: Math.max(base.highestUnlockedLevel, newLevel),
              board: nextBoard,
              feverProgress: triggeredFever ? 0 : nextFever,
              feverUntil: triggeredFever ? now + 20000 : base.feverUntil,
              tutorialStep: base.tutorialStep === 0 ? 1 : base.tutorialStep,
            };
          });

          if (isNewBreed) {
            showToast(`Открыта новая порода: ${CAT_TIERS[newLevel - 1].name}!`);
            if (newLevel >= 4) {
              void showInterstitialWithCooldown();
            }
          }

          const tier = CAT_TIERS[newLevel - 1];
          const label =
            nextCombo >= 2
              ? `КОМБО x${nextCombo} · +${formatCoins(mergeReward)}`
              : `Ур. ${newLevel} · +${formatCoins(mergeReward)}`;
          pushFloating(label, screenPos.x, screenPos.y, 'merge', tier?.name);
          return;
        }

        // Different cat or crate -> swap
        soundEngine.playDrop();
        setState((prev) => {
          const nextBoard = [...prev.board];
          const a = nextBoard[fromIndex];
          const b = nextBoard[toIndex];
          if (!a || !b) return prev;
          nextBoard[fromIndex] = { ...b, index: fromIndex };
          nextBoard[toIndex] = { ...a, index: toIndex };
          return { ...prev, board: nextBoard };
        });
      },
      onMouseCaught: (screenPos) => {
        setMouseOnBoard(false);
        soundEngine.playMouseSqueak();
        soundEngine.playFever();
        const cur = stateRef.current;
        const rate = computeBaseIncomePerSec(cur);
        const coinBonus = Math.max(100, Math.round(rate * 15));

        setState((prev) => ({
          ...prev,
          coins: prev.coins + coinBonus,
          gems: prev.gems + 2,
          spinTickets: prev.spinTickets + 1,
          totalMiceCaught: prev.totalMiceCaught + 1,
        }));

        pushFloating(
          `+${formatCoins(coinBonus)} · +2 С · +1 Билет!`,
          screenPos.x,
          screenPos.y,
          'mouse',
          'Золотая Мышь поймана!',
        );
        showToast('Мышь поймана! +Билет Колеса Удачи и +2 Самоцвета!');
      },
      onAsmrTap: (mode, screenPos) => {
        const cur = stateRef.current;
        if (mode === 'soap') {
          soundEngine.playSoapSlice();
        } else {
          soundEngine.playPopBlock(cur.totalAsmrSlices);
        }
        const tinyBonus = Math.max(3, Math.round(computeBaseIncomePerSec(cur) * 0.6));
        const nextCount = (cur.totalAsmrSlices || 0) + 1;
        const zenReward = nextCount % 10 === 0;

        setState((prev) => {
          const base = ensureDailyReset(prev);
          return {
            ...base,
            coins: base.coins + tinyBonus,
            gems: zenReward ? base.gems + 3 : base.gems,
            totalAsmrSlices: nextCount,
            dailyProgress: {
              ...base.dailyProgress,
              asmr: base.dailyProgress.asmr + 1,
            },
          };
        });

        pushFloating(
          zenReward ? `+${formatCoins(tinyBonus)} · +3 С Дзен!` : `+${formatCoins(tinyBonus)}`,
          screenPos.x,
          screenPos.y,
          zenReward ? 'gem' : 'coin',
          mode === 'soap' ? 'Вжух!' : 'Поп!',
        );
      },
      onContextLost: () => setWebglLost(true),
      onContextRestored: () => setWebglLost(false),
    });

    sceneRef.current = controller;
    controller.syncBoard(stateRef.current.board);
    controller.setPs2Filter(stateRef.current.ps2Filter);
    controller.setAsmrMode(stateRef.current.asmrMode);

    // Initialize Yandex Games SDK and call LoadingAPI.ready() strictly once after 3D scene & UI are ready
    void initYandexSdk().then(() => {
      notifyYandexLoadingReady();
      if (!document.hidden && !hardPausedRef.current) {
        notifyGameplayStart();
      }
    });

    return () => {
      controller.dispose();
      sceneRef.current = null;
    };
  }, [pushFloating, showToast, showInterstitialWithCooldown]);

  // Sync board, theme, PS2 filter, ASMR mode, fish rain & fever state
  useEffect(() => {
    sceneRef.current?.syncBoard(state.board);
  }, [state.board]);

  useEffect(() => {
    sceneRef.current?.setTheme(state.themeId);
  }, [state.themeId]);

  useEffect(() => {
    sceneRef.current?.setPs2Filter(state.ps2Filter);
  }, [state.ps2Filter]);

  useEffect(() => {
    sceneRef.current?.setAsmrMode(state.asmrMode);
  }, [state.asmrMode]);

  useEffect(() => {
    sceneRef.current?.setFeverMode(feverActive);
  }, [feverActive]);

  useEffect(() => {
    sceneRef.current?.setFishRain(fishRainActive);
  }, [fishRainActive]);

  useEffect(() => {
    sceneRef.current?.setZoomiesMode(zoomiesActive);
  }, [zoomiesActive]);

  useEffect(() => {
    sceneRef.current?.setFlashSaleMode(flashSaleActive);
  }, [flashSaleActive]);

  // Passive Income, Live Crate Progress Visualizer, Combo decay & Mouse status loop
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (hardPausedRef.current) return;
      const t = Date.now();
      setNowMs(t);
      setMouseOnBoard(Boolean(sceneRef.current?.isMouseActive()));
      if (comboRef.current.count > 0 && comboRef.current.expiresAt <= t) {
        comboRef.current = { count: 0, expiresAt: 0 };
        setComboCount(0);
      }

      const cur = stateRef.current;
      const doubleOn = cur.doubleIncomeUntil > t;
      const tripleOn = cur.tripleIncomeUntil > t;
      const feverOn = cur.feverUntil > t;
      const rainOn = cur.fishRainUntil > t;
      const zoomiesOn = cur.zoomiesUntil > t;

      // Advance crate progress timer smoothly (accelerated 2x by Ad Boost & Zoomies!)
      const baseIntervalMs = Math.max(3500, (10 - cur.upgrades.crateSpeedLevel) * 1000);
      const speedMult = (doubleOn ? 2 : 1) * (zoomiesOn ? 2 : 1);
      const hasSpace = cur.board.some((s) => s === null);
      let droppedIdx = -1;

      if (hasSpace) {
        crateElapsedRef.current += 250 * speedMult;
        if (crateElapsedRef.current >= baseIntervalMs) {
          crateElapsedRef.current = 0;
          const emptyIndices: number[] = [];
          cur.board.forEach((slot, idx) => {
            if (!slot) emptyIndices.push(idx);
          });
          if (emptyIndices.length > 0) {
            droppedIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
          }
        }
        const pct = Math.min(100, Math.round((crateElapsedRef.current / baseIntervalMs) * 100));
        const remSec = Math.max(
          1,
          Math.ceil((baseIntervalMs - crateElapsedRef.current) / (1000 * speedMult)),
        );
        setCrateProgressPct(pct);
        setCrateSecondsLeft(remSec);
      } else {
        setCrateProgressPct(100);
        setCrateSecondsLeft(0);
      }

      if (droppedIdx >= 0) {
        sceneRef.current?.triggerCrateDropEffect([droppedIdx]);
      }

      setState((prev) => {
        const mult =
          (doubleOn ? 2 : 1) *
          (tripleOn ? 3 : 1) *
          (feverOn ? 2 : 1) *
          (rainOn ? 2.5 : 1) *
          (zoomiesOn ? 2 : 1);
        const earned = computeBaseIncomePerSec(prev) * mult * 0.25;
        const nextFeverProg = feverOn
          ? 100
          : Math.max(0, prev.feverProgress - 0.5);

        let nextBoard = prev.board;
        if (droppedIdx >= 0 && !prev.board[droppedIdx]) {
          nextBoard = [...prev.board];
          nextBoard[droppedIdx] = { index: droppedIdx, kind: 'crate', level: 1, id: uid() };
        }

        if (earned <= 0 && nextFeverProg === prev.feverProgress && nextBoard === prev.board) {
          return prev;
        }
        return {
          ...prev,
          coins: prev.coins + earned,
          feverProgress: nextFeverProg,
          board: nextBoard,
        };
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  // Autonomous Random World Events Engine (happens naturally every ~22–32s)
  useEffect(() => {
    let timeoutId = 0;

    const triggerRandomEvent = () => {
      if (hardPausedRef.current) {
        timeoutId = window.setTimeout(triggerRandomEvent, 5000);
        return;
      }
      const cur = stateRef.current;
      const emptyIndices: number[] = [];
      cur.board.forEach((slot, idx) => {
        if (!slot) emptyIndices.push(idx);
      });

      const pool: Array<'fish_rain' | 'zoomies' | 'crate_drop' | 'flash_sale' | 'golden_mouse'> = [
        'fish_rain',
        'zoomies',
        'crate_drop',
        'flash_sale',
        'golden_mouse',
      ];
      const candidates = pool.filter((e) => e !== lastEventRef.current);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)] || 'fish_rain';
      lastEventRef.current = chosen;

      const now = Date.now();
      if (chosen === 'golden_mouse') {
        if (sceneRef.current?.spawnGoldenMouse()) {
          setMouseOnBoard(true);
          soundEngine.playMouseSqueak();
          showToast('Случайное событие: Золотая Мышь на доске!');
        }
      } else if (chosen === 'fish_rain') {
        const gift = Math.max(90, Math.round(computeBaseIncomePerSec(cur) * 8));
        soundEngine.playFever();
        setState((prev) => ({
          ...prev,
          coins: prev.coins + gift,
          fishRainUntil: now + 14000,
        }));
        showToast(`Случайное событие: Рыбный дождь x2.5 на 14с (+${formatCoins(gift)} М)!`);
      } else if (chosen === 'zoomies') {
        soundEngine.playFever();
        setState((prev) => ({
          ...prev,
          zoomiesUntil: now + 15000,
        }));
        showToast('Случайное событие: Кошачий Тыгыдык! x2 доход и x2 скорость посылок!');
      } else if (chosen === 'flash_sale') {
        soundEngine.playCoin();
        setState((prev) => ({
          ...prev,
          flashSaleUntil: now + 18000,
        }));
        showToast('Случайное событие: Счастливый купон -30% на покупку котов (18с)!');
      } else if (chosen === 'crate_drop') {
        if (emptyIndices.length > 0) {
          const count = Math.min(3, emptyIndices.length);
          const shuffled = [...emptyIndices].sort(() => Math.random() - 0.5).slice(0, count);
          soundEngine.playMerge(cur.upgrades.spawnLevel, 2);
          sceneRef.current?.triggerCrateDropEffect(shuffled);
          setState((prev) => {
            const nb = [...prev.board];
            for (const idx of shuffled) {
              if (!nb[idx]) {
                nb[idx] = { index: idx, kind: 'crate', level: 1, id: uid() };
              }
            }
            return { ...prev, board: nb };
          });
          showToast(`Случайное событие: Коробкопад! +${count} бесплатных посылки!`);
        } else {
          const gift = Math.max(120, Math.round(computeBaseIncomePerSec(cur) * 12));
          soundEngine.playCoin();
          setState((prev) => ({ ...prev, coins: prev.coins + gift }));
          showToast(`Случайный бонус: +${formatCoins(gift)} монет!`);
        }
      }

      // Occasionally surface a tempting Stray Elite Cat Ad Offer when board has room
      if (emptyIndices.length >= 1 && cur.tutorialStep >= 2 && Math.random() < 0.55) {
        setStrayCatOfferUntil(Date.now() + 18000);
      }

      const nextDelayMs = 22000 + Math.floor(Math.random() * 10000);
      timeoutId = window.setTimeout(triggerRandomEvent, nextDelayMs);
    };

    timeoutId = window.setTimeout(triggerRandomEvent, 12000);
    return () => window.clearTimeout(timeoutId);
  }, [showToast]);

  const spawnLevel = state.upgrades.spawnLevel;
  const spawnCost = getCatPurchasePrice(
    spawnLevel,
    state.purchasesPerLevel[spawnLevel] || 0,
    flashSaleActive,
  );
  const hasEmptySlot = state.board.some((s) => s === null);

  const handleBuyCat = (level: number, isFromShop = false) => {
    const emptyIdx = state.board.findIndex((s) => s === null);
    if (emptyIdx < 0) {
      showToast('Доска заполнена! Объедини котов или нажми Авто-слияние');
      return;
    }
    const timesBought = state.purchasesPerLevel[level] || 0;
    const cost = getCatPurchasePrice(level, timesBought, state.flashSaleUntil > Date.now());
    if (state.coins < cost) {
      showToast('Недостаточно монет!');
      return;
    }

    soundEngine.playPickup();
    setState((prev) => {
      const idx = prev.board.findIndex((s) => s === null);
      if (idx < 0) return prev;
      const nextBoard = [...prev.board];
      nextBoard[idx] = { index: idx, kind: 'cat', level, id: uid() };
      return {
        ...prev,
        coins: prev.coins - cost,
        board: nextBoard,
        purchasesPerLevel: {
          ...prev.purchasesPerLevel,
          [level]: (prev.purchasesPerLevel[level] || 0) + 1,
        },
      };
    });

    if (isFromShop) {
      showToast(`Кот Ур. ${level} добавлен на доску`);
    }
  };

  const findMergePair = (board: (BoardSlot | null)[]): [number, number] | null => {
    const byLevel = new Map<number, number[]>();
    board.forEach((slot, idx) => {
      if (slot && slot.kind === 'cat' && slot.level < 12) {
        const list = byLevel.get(slot.level) || [];
        list.push(idx);
        byLevel.set(slot.level, list);
      }
    });
    for (const [, indices] of byLevel) {
      if (indices.length >= 2) {
        return [indices[0], indices[1]];
      }
    }
    return null;
  };

  const canAutoMerge = useMemo(() => findMergePair(state.board) !== null, [state.board]);

  const handleAutoMerge = () => {
    const pair = findMergePair(state.board);
    if (!pair) {
      showToast('Нет одинаковых котов для слияния');
      return;
    }
    if (state.autoMergeCharges <= 0 && state.gems < 10) {
      openRewardedAd({
        id: 'auto_merge',
        title: 'Заряды Авто-слияния',
        description:
          'Посмотри короткий ролик, чтобы получить +3 авто-слияния и +5 самоцветов.',
        rewardLabel: '+3 Авто-слияния и +5 С',
      });
      return;
    }

    const [aIdx, bIdx] = pair;
    const catA = state.board[aIdx]!;
    const newLevel = catA.level + 1;
    const reward = newLevel * 22;

    soundEngine.playMerge(newLevel, 2);
    sceneRef.current?.triggerMergeEffect(bIdx, newLevel);
    const pos = sceneRef.current?.projectSlotToScreen(bIdx) || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    pushFloating(
      `Ур. ${newLevel} · +${formatCoins(reward)}`,
      pos.x,
      pos.y,
      'merge',
      CAT_TIERS[newLevel - 1]?.name,
    );

    setState((prev) => {
      const base = ensureDailyReset(prev);
      const nextBoard = [...base.board];
      nextBoard[aIdx] = null;
      nextBoard[bIdx] = { index: bIdx, kind: 'cat', level: newLevel, id: uid() };
      const useCharge = base.autoMergeCharges > 0;
      return {
        ...base,
        coins: base.coins + reward,
        totalMerges: base.totalMerges + 1,
        dailyProgress: {
          ...base.dailyProgress,
          merges: base.dailyProgress.merges + 1,
        },
        highestUnlockedLevel: Math.max(base.highestUnlockedLevel, newLevel),
        board: nextBoard,
        autoMergeCharges: useCharge ? base.autoMergeCharges - 1 : base.autoMergeCharges,
        gems: useCharge ? base.gems : base.gems - 10,
      };
    });
  };

  const cycleAsmrMode = () => {
    const order: AsmrToyMode[] = ['soap', 'pop', 'off'];
    const next = order[(order.indexOf(state.asmrMode) + 1) % order.length];
    setState((prev) => ({ ...prev, asmrMode: next }));
    showToast(
      next === 'soap'
        ? 'Релакс сбоку: Резка мыла'
        : next === 'pop'
          ? 'Релакс сбоку: Поп-Кубы'
          : 'Боковой релакс скрыт',
    );
  };

  const applyAdReward = (offer: RewardedAdOffer) => {
    soundEngine.playFever();
    const curState = stateRef.current;
    const curRate = computeBaseIncomePerSec(curState);

    if (offer.id === 'double_income') {
      const instantBurst = Math.max(120, Math.round(curRate * 15));
      setState((prev) => {
        const base = ensureDailyReset(prev);
        return {
          ...base,
          coins: base.coins + instantBurst,
          gems: base.gems + 5,
          doubleIncomeUntil: Date.now() + 120000,
          dailyProgress: { ...base.dailyProgress, ads: base.dailyProgress.ads + 1 },
        };
      });
      showToast(
        `x2 Доход на 2 мин! Скорость посылок x2, +${formatCoins(instantBurst)} М и +5 С!`,
      );
    } else if (offer.id === 'crate_frenzy') {
      const emptyIndices: number[] = [];
      curState.board.forEach((s, idx) => {
        if (!s) emptyIndices.push(idx);
      });
      const spawnTargets = emptyIndices.sort(() => Math.random() - 0.5).slice(0, 5);
      setCrateFrenzyReadyAt(Date.now() + 65000);
      if (spawnTargets.length > 0) {
        sceneRef.current?.triggerCrateDropEffect(spawnTargets);
        setState((prev) => {
          const base = ensureDailyReset(prev);
          const nb = [...base.board];
          spawnTargets.forEach((idx, i) => {
            if (!nb[idx]) {
              nb[idx] =
                i % 2 === 0
                  ? { index: idx, kind: 'cat', level: base.upgrades.spawnLevel, id: uid() }
                  : { index: idx, kind: 'crate', level: 1, id: uid() };
            }
          });
          return {
            ...base,
            board: nb,
            gems: base.gems + 5,
            dailyProgress: { ...base.dailyProgress, ads: base.dailyProgress.ads + 1 },
          };
        });
        showToast(`Дождь посылок: высажено +${spawnTargets.length} котов/коробок и +5 С!`);
      } else {
        const fallbackCoins = Math.max(250, Math.round(curRate * 25));
        setState((prev) => {
          const base = ensureDailyReset(prev);
          return {
            ...base,
            coins: base.coins + fallbackCoins,
            autoMergeCharges: base.autoMergeCharges + 1,
            gems: base.gems + 5,
            dailyProgress: { ...base.dailyProgress, ads: base.dailyProgress.ads + 1 },
          };
        });
        showToast(
          `Доска полная: +1 Авто-слияние, +${formatCoins(fallbackCoins)} М и +5 С!`,
        );
      }
    } else if (offer.id === 'auto_merge') {
      setState((prev) => {
        const base = ensureDailyReset(prev);
        return {
          ...base,
          autoMergeCharges: base.autoMergeCharges + 3,
          gems: base.gems + 5,
          dailyProgress: { ...base.dailyProgress, ads: base.dailyProgress.ads + 1 },
        };
      });
      showToast('Получено +3 Авто-слияния и +5 Самоцветов!');
    } else if (offer.id === 'spin_ticket') {
      setState((prev) => {
        const base = ensureDailyReset(prev);
        return {
          ...base,
          spinTickets: base.spinTickets + 1,
          gems: base.gems + 5,
          dailyProgress: { ...base.dailyProgress, ads: base.dailyProgress.ads + 1 },
        };
      });
      setAdOffer(null);
      setActiveModal('fortune');
      showToast('Получен +1 билет Колеса Удачи и +5 Самоцветов!');
      return;
    } else if (offer.id === 'bonus_cat') {
      const bonusLvl = Math.min(12, curState.upgrades.spawnLevel + 2);
      setStrayCatOfferUntil(0);
      setState((prev) => {
        const base = ensureDailyReset(prev);
        const emptyIdx = base.board.findIndex((s) => s === null);
        if (emptyIdx < 0) {
          return {
            ...base,
            gems: base.gems + 25,
            dailyProgress: { ...base.dailyProgress, ads: base.dailyProgress.ads + 1 },
          };
        }
        const nextBoard = [...base.board];
        nextBoard[emptyIdx] = { index: emptyIdx, kind: 'cat', level: bonusLvl, id: uid() };
        return {
          ...base,
          board: nextBoard,
          gems: base.gems + 5,
          highestUnlockedLevel: Math.max(base.highestUnlockedLevel, bonusLvl),
          dailyProgress: { ...base.dailyProgress, ads: base.dailyProgress.ads + 1 },
        };
      });
      showToast(`Элитный кот Ур. ${bonusLvl} высажен на доску (+5 С)!`);
    } else if (offer.id === 'offline_double') {
      const amount = offlineCoins * 2;
      setState((prev) => {
        const base = ensureDailyReset(prev);
        return {
          ...base,
          coins: base.coins + amount,
          gems: base.gems + 5,
          dailyProgress: { ...base.dailyProgress, ads: base.dailyProgress.ads + 1 },
        };
      });
      setOfflineCoins(0);
      showToast(`Оффлайн-доход удвоен: +${formatCoins(amount)} М и +5 С!`);
    }

    setAdOffer(null);
    setActiveModal(null);
  };

  const openRewardedAd = async (offer: RewardedAdOffer) => {
    let rewardedViaCallback = false;
    const portalResult = await showYandexRewardedVideo(
      (paused) => {
        adPausedRef.current = paused;
        syncHardPause();
      },
      () => {
        rewardedViaCallback = true;
        applyAdReward(offer);
      },
    );
    if (portalResult === 'rewarded' || rewardedViaCallback) {
      return;
    }
    if (portalResult === 'declined') {
      showToast('Досмотри ролик до конца, чтобы получить награду');
      return;
    }
    setAdOffer(offer);
    setActiveModal('ad');
  };

  const handleCompleteAd = () => {
    if (!adOffer) return;
    applyAdReward(adOffer);
  };

  const handleSpinWheelComplete = (sector: WheelSector, method: 'ticket' | 'gems') => {
    soundEngine.playFever();
    setState((prev) => {
      const next = {
        ...prev,
        spinTickets: method === 'ticket' ? Math.max(0, prev.spinTickets - 1) : prev.spinTickets,
        gems: method === 'gems' ? Math.max(0, prev.gems - 15) : prev.gems,
      };

      if (sector.kind === 'coins') {
        const payout = Math.max(150, Math.round(computeBaseIncomePerSec(prev) * sector.value));
        next.coins += payout;
      } else if (sector.kind === 'gems' || sector.kind === 'jackpot') {
        next.gems += sector.value;
      } else if (sector.kind === 'auto_merge') {
        next.autoMergeCharges += sector.value;
      } else if (sector.kind === 'boost_3x') {
        next.tripleIncomeUntil = Date.now() + sector.value * 1000;
      } else if (sector.kind === 'bonus_cat') {
        const emptyIdx = prev.board.findIndex((s) => s === null);
        const lvl = Math.min(12, prev.upgrades.spawnLevel + sector.value);
        if (emptyIdx >= 0) {
          const nb = [...prev.board];
          nb[emptyIdx] = { index: emptyIdx, kind: 'cat', level: lvl, id: uid() };
          next.board = nb;
          next.highestUnlockedLevel = Math.max(prev.highestUnlockedLevel, lvl);
        } else {
          next.gems += 20;
        }
      }
      return next;
    });
    showToast(`Колесо Удачи: ${sector.label}!`);
  };

  const handleClaimDaily = () => {
    if (!canClaimDaily) return;
    const reward = DAILY_REWARDS[state.streakDay] || DAILY_REWARDS[0];
    soundEngine.playFever();

    setState((prev) => {
      const next = {
        ...prev,
        streakDay: (prev.streakDay + 1) % DAILY_REWARDS.length,
        lastDailyClaimAt: Date.now(),
      };
      if (reward.kind === 'coins') {
        next.coins += reward.amount;
      } else if (reward.kind === 'gems') {
        next.gems += reward.amount;
      } else if (reward.kind === 'auto_merge') {
        next.autoMergeCharges += reward.amount;
      } else if (reward.kind === 'bonus_cat') {
        const emptyIdx = prev.board.findIndex((s) => s === null);
        const lvl = Math.min(12, prev.upgrades.spawnLevel + reward.amount);
        if (emptyIdx >= 0) {
          const nb = [...prev.board];
          nb[emptyIdx] = { index: emptyIdx, kind: 'cat', level: lvl, id: uid() };
          next.board = nb;
          next.highestUnlockedLevel = Math.max(prev.highestUnlockedLevel, lvl);
        } else {
          next.gems += 25;
        }
      }
      return next;
    });
    showToast(`Бонус дня получен: ${reward.label}!`);
  };

  const handlePrestige = async () => {
    const gain = getPendingGoldenFish(state.highestUnlockedLevel, state.totalMerges);
    if (gain <= 0) return;
    await showInterstitialWithCooldown();
    soundEngine.playFever();
    setState((prev) =>
      createInitialState({
        gems: prev.gems,
        goldenFish: (prev.goldenFish || 0) + gain,
        spinTickets: prev.spinTickets + 1,
        streakDay: prev.streakDay,
        lastDailyClaimAt: prev.lastDailyClaimAt,
        totalMerges: prev.totalMerges,
        totalTaps: prev.totalTaps,
        totalCratesOpened: prev.totalCratesOpened,
        totalMiceCaught: prev.totalMiceCaught,
        totalAsmrSlices: prev.totalAsmrSlices,
        claimedMissions: prev.claimedMissions,
        dailyDateKey: prev.dailyDateKey,
        dailyProgress: prev.dailyProgress,
        dailyClaimedIds: prev.dailyClaimedIds,
        dailyChestClaimed: prev.dailyChestClaimed,
        autoMergeCharges: prev.autoMergeCharges,
        themeId: prev.themeId,
        asmrMode: prev.asmrMode,
        tutorialStep: 3,
        ps2Filter: prev.ps2Filter,
        muted: prev.muted,
        ambientEnabled: prev.ambientEnabled,
        vipPackOwned: prev.vipPackOwned,
      }),
    );
    setActiveModal(null);
    showToast(`Кото-Нирвана! Получено +${gain} Золотых Рыбок (+${gain * 50}% навсегда)!`);
  };

  const handleBuyUpgrade = (
    kind: 'spawnLevel' | 'incomeMultiplierLevel' | 'crateSpeedLevel',
  ) => {
    const cost = getUpgradeCost(kind, state.upgrades[kind]);
    if (cost.currency === 'coins' && state.coins < cost.amount) return;
    if (cost.currency === 'gems' && state.gems < cost.amount) return;

    soundEngine.playCoin();
    setState((prev) => ({
      ...prev,
      coins: cost.currency === 'coins' ? prev.coins - cost.amount : prev.coins,
      gems: cost.currency === 'gems' ? prev.gems - cost.amount : prev.gems,
      upgrades: {
        ...prev.upgrades,
        [kind]: prev.upgrades[kind] + 1,
      },
    }));
  };

  const handleBuyTheme = (themeId: BoardThemeId) => {
    const theme = BOARD_THEMES.find((t) => t.id === themeId);
    if (!theme) return;
    if (theme.priceGems > 0 && state.gems < theme.priceGems) return;
    soundEngine.playCoin();
    setState((prev) => ({
      ...prev,
      gems: prev.gems - theme.priceGems,
      themeId,
    }));
  };

  const handleBuyVipPack = () => {
    if (state.vipPackOwned) return;
    soundEngine.playFever();
    setState((prev) => ({
      ...prev,
      vipPackOwned: true,
      gems: prev.gems + 150,
      autoMergeCharges: prev.autoMergeCharges + 5,
      spinTickets: prev.spinTickets + 3,
      coins: prev.coins + 25000,
    }));
    showToast('Набор PS2 VIP Старт активирован!');
  };

  const handleBuyGemPack = (gems: number) => {
    soundEngine.playCoin();
    setState((prev) => ({
      ...prev,
      gems: prev.gems + gems,
    }));
    showToast(`Начислено +${gems} самоцветов!`);
  };

  const handleClaimDiscovery = (level: number) => {
    if (state.discoveredRewardsClaimed.includes(level)) return;
    const reward = level * 5;
    soundEngine.playCoin();
    setState((prev) => ({
      ...prev,
      gems: prev.gems + reward,
      discoveredRewardsClaimed: [...prev.discoveredRewardsClaimed, level],
    }));
    showToast(`Получено +${reward} самоцветов за породу!`);
  };

  const handleClaimMission = (missionId: string) => {
    const def = MISSIONS.find((m) => m.id === missionId);
    if (!def || state.claimedMissions.includes(missionId)) return;
    soundEngine.playCoin();
    setState((prev) => ({
      ...prev,
      gems: prev.gems + def.rewardGems,
      claimedMissions: [...prev.claimedMissions, missionId],
    }));
    showToast(`Достижение выполнено: +${def.rewardGems} самоцветов!`);
  };

  const handleClaimDailyMission = (missionId: string) => {
    const def = DAILY_MISSIONS.find((m) => m.id === missionId);
    if (!def || state.dailyClaimedIds.includes(missionId)) return;
    soundEngine.playCoin();
    setState((prev) => {
      const base = ensureDailyReset(prev);
      return {
        ...base,
        gems: base.gems + def.rewardGems,
        spinTickets: base.spinTickets + (def.rewardTickets || 0),
        dailyClaimedIds: [...base.dailyClaimedIds, missionId],
      };
    });
    showToast(
      `Миссия дня: +${def.rewardGems} С${def.rewardTickets ? ` и +${def.rewardTickets} Билет!` : '!'}`,
    );
  };

  const handleClaimDailyChest = () => {
    if (state.dailyChestClaimed) return;
    const completedAll = DAILY_MISSIONS.every(
      (dm) => (state.dailyProgress[dm.type] || 0) >= dm.target,
    );
    if (!completedAll) return;
    soundEngine.playFever();
    setState((prev) => {
      const base = ensureDailyReset(prev);
      return {
        ...base,
        gems: base.gems + 60,
        spinTickets: base.spinTickets + 1,
        dailyChestClaimed: true,
      };
    });
    showToast('Сундук дня открыт: +60 Самоцветов и +1 Билет Удачи!');
  };

  const handleClaimOffline = (doubled: boolean) => {
    if (doubled) {
      void openRewardedAd({
        id: 'offline_double',
        title: 'Удвоить оффлайн-доход',
        description: `Посмотри короткий ролик, чтобы получить x2 монет (+${formatCoins(offlineCoins * 2)} М) и +5 Самоцветов!`,
        rewardLabel: `+${formatCoins(offlineCoins * 2)} монет`,
      });
      return;
    }
    soundEngine.playCoin();
    setState((prev) => ({
      ...prev,
      coins: prev.coins + offlineCoins,
    }));
    setOfflineCoins(0);
    setActiveModal(null);
    showToast(`Зачислено +${formatCoins(offlineCoins)} монет!`);
  };

  const handleFinishTutorial = () => {
    soundEngine.playFever();
    setState((prev) => ({
      ...prev,
      tutorialStep: 3,
      gems: prev.gems + 20,
    }));
    showToast('Обучение пройдено! Награда: +20 Самоцветов!');
  };

  const unclaimedCatalogCount = useMemo(() => {
    let count = 0;
    for (let lvl = 1; lvl <= state.highestUnlockedLevel; lvl++) {
      if (!state.discoveredRewardsClaimed.includes(lvl)) count++;
    }
    return count;
  }, [state.highestUnlockedLevel, state.discoveredRewardsClaimed]);

  const unclaimedMissionCount = useMemo(() => {
    const achReady = MISSIONS.filter((m) => {
      if (state.claimedMissions.includes(m.id)) return false;
      const val =
        m.type === 'merges'
          ? state.totalMerges
          : m.type === 'maxLevel'
            ? state.highestUnlockedLevel
            : m.type === 'taps'
              ? state.totalTaps
              : m.type === 'mice'
                ? state.totalMiceCaught
                : state.totalCratesOpened;
      return val >= m.target;
    }).length;

    const dailyReady = DAILY_MISSIONS.filter((dm) => {
      if (state.dailyClaimedIds.includes(dm.id)) return false;
      return (state.dailyProgress[dm.type] || 0) >= dm.target;
    }).length;

    const dailyCompletedAll = DAILY_MISSIONS.every(
      (dm) => (state.dailyProgress[dm.type] || 0) >= dm.target,
    );
    const chestReady = dailyCompletedAll && !state.dailyChestClaimed ? 1 : 0;

    return achReady + dailyReady + chestReady;
  }, [state]);

  const hudSurface = isDark
    ? 'bg-[#1B2030]/92 text-[#F1F5F9] border-white/12'
    : 'bg-[#FFFFFF]/92 text-[#171B26] border-slate-900/10';

  const doubleSecondsLeft = Math.max(0, Math.ceil((state.doubleIncomeUntil - nowMs) / 1000));
  const tripleSecondsLeft = Math.max(0, Math.ceil((state.tripleIncomeUntil - nowMs) / 1000));
  const feverSecondsLeft = Math.max(0, Math.ceil((state.feverUntil - nowMs) / 1000));
  const rainActiveLeft = Math.max(0, Math.ceil((state.fishRainUntil - nowMs) / 1000));
  const zoomiesActiveLeft = Math.max(0, Math.ceil((state.zoomiesUntil - nowMs) / 1000));
  const flashSaleLeft = Math.max(0, Math.ceil((state.flashSaleUntil - nowMs) / 1000));
  const crateFrenzyCooldownLeft = Math.max(0, Math.ceil((crateFrenzyReadyAt - nowMs) / 1000));
  const strayCatActive = strayCatOfferUntil > nowMs && hasEmptySlot;
  const occupiedCount = state.board.filter(Boolean).length;
  const spawnBuyProgressPct = Math.min(100, Math.round((state.coins / Math.max(1, spawnCost)) * 100));
  const fortuneAttention = state.spinTickets > 0 || canClaimDaily;

  const totalMenuAlerts = unclaimedCatalogCount + unclaimedMissionCount;

  return (
    <div
      className="relative h-[100dvh] w-screen overflow-hidden select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Dedicated WebGL 3D Viewport Container */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {/* Optional PS2 CRT Scanlines */}
      {state.ps2Filter && (
        <div className="ps2-scanlines pointer-events-none fixed inset-0 z-10" />
      )}

      {/* WebGL Context Lost Fallback */}
      {webglLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#E6EAF2] p-6 text-center">
          <div className="max-w-sm rounded-xl border border-slate-900/10 bg-white p-6 shadow-lg">
            <h2 className="font-display text-lg font-bold">Восстановление 3D-сцены</h2>
            <p className="mt-2 text-sm text-slate-600">
              Графический контекст временно сброшен. Нажми обновить, чтобы продолжить игру.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-[#3B66F5] px-4 py-2 text-sm font-semibold text-white"
            >
              Обновить
            </button>
          </div>
        </div>
      )}

      {/* Responsive & Collapsible Top HUD Bar (Laptops, Desktop PC, iPhone, Android) */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col gap-1.5 px-2.5 sm:px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
        {topCollapsed ? (
          <div className="flex items-center justify-end">
            <div
              className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-2.5 py-1.5 shadow-sm ${hudSurface}`}
            >
              <div className="flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="font-mono-num text-xs font-bold">
                  {formatCoins(state.coins)}
                </span>
              </div>
              <span className="h-3.5 w-px bg-current/15" aria-hidden="true" />
              <button
                onClick={() => setTopCollapsed(false)}
                className="flex min-h-[30px] items-center gap-1 rounded-lg px-1.5 text-xs font-semibold hover:bg-current/5 transition-colors whitespace-nowrap"
                title="Показать верхнюю панель"
                aria-label="Показать верхнюю панель"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Панель</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            {/* Left: Brand, Currencies & Slim Fever Bar */}
            <div className="pointer-events-auto flex flex-col gap-1 min-w-0">
              <div
                className={`flex items-center gap-2 sm:gap-3 rounded-xl border px-2.5 sm:px-3.5 py-1.5 sm:py-2 shadow-sm ${hudSurface}`}
              >
                <span className="hidden lg:inline font-display text-sm font-extrabold tracking-tight whitespace-nowrap">
                  NEKO MERGE DX
                </span>

                <span
                  className="hidden lg:block h-3.5 w-px bg-current/15"
                  aria-hidden="true"
                />

                <div className="flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0" />
                  <span className="font-mono-num text-xs sm:text-sm font-bold">
                    {formatCoins(state.coins)}
                  </span>
                  <span className="hidden sm:inline text-[11px] opacity-65 font-mono-num whitespace-nowrap">
                    +{formatCoins(incomePerSec)}/с
                  </span>
                </div>

                <span className="h-3.5 w-px bg-current/15" aria-hidden="true" />

                <div className="flex items-center gap-1">
                  <Gem className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500 shrink-0" />
                  <span className="font-mono-num text-xs sm:text-sm font-bold">
                    {state.gems}
                  </span>
                </div>

                {state.goldenFish > 0 && (
                  <>
                    <span className="h-3.5 w-px bg-current/15" aria-hidden="true" />
                    <div
                      className="flex items-center gap-1 text-amber-500"
                      title="Бонус Золотых Рыбок"
                    >
                      <Fish className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono-num text-xs font-bold">
                        +{state.goldenFish * 50}%
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Process Visualization: Fever, Crate Drop Timer & Live Events */}
              <div className="flex flex-wrap items-center gap-1.5">
                <div
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 shadow-sm w-[142px] sm:w-[195px] ${hudSurface}`}
                >
                  <Flame
                    className={`h-3.5 w-3.5 shrink-0 ${
                      feverActive ? 'text-orange-500' : 'opacity-50'
                    }`}
                  />
                  <div className="flex-1 h-1.5 rounded-full bg-current/12 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        feverActive ? 'bg-orange-500' : 'bg-[#3B66F5]'
                      }`}
                      style={{ width: `${feverActive ? 100 : state.feverProgress}%` }}
                    />
                  </div>
                  <span className="font-mono-num text-[10px] sm:text-[11px] font-semibold whitespace-nowrap">
                    {feverActive ? `x2 · ${feverSecondsLeft}с` : 'Лихорадка'}
                  </span>
                </div>

                {/* Next Free Crate Visualizer */}
                <div
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 shadow-sm w-[132px] sm:w-[168px] ${hudSurface}`}
                  title="Таймер следующей бесплатной посылки и заполненность доски"
                >
                  <Gift className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <div className="flex-1 h-1.5 rounded-full bg-current/12 overflow-hidden">
                    <div
                      className="h-full bg-[#0FA968] transition-all duration-200"
                      style={{ width: `${crateProgressPct}%` }}
                    />
                  </div>
                  <span className="font-mono-num text-[10px] sm:text-[11px] font-semibold whitespace-nowrap">
                    {hasEmptySlot ? `${crateSecondsLeft}с` : `${occupiedCount}/16`}
                  </span>
                </div>

                {comboActive && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500 px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold font-mono-num text-slate-950 shadow-sm whitespace-nowrap">
                    КОМБО x{comboCount}
                  </div>
                )}

                {doubleActive && (
                  <div className="rounded-lg border border-emerald-500/40 bg-[#0FA968] px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold font-mono-num text-white shadow-sm whitespace-nowrap">
                    x2 Доход · {doubleSecondsLeft}с
                  </div>
                )}

                {tripleActive && (
                  <div className="rounded-lg border border-emerald-500/40 bg-[#0FA968] px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold font-mono-num text-white shadow-sm whitespace-nowrap">
                    x3 · {tripleSecondsLeft}с
                  </div>
                )}

                {fishRainActive && (
                  <div className="flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500 px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold font-mono-num text-white shadow-sm whitespace-nowrap">
                    <CloudRain className="h-3 w-3 shrink-0" />
                    <span>Дождь x2.5 · {rainActiveLeft}с</span>
                  </div>
                )}

                {zoomiesActive && (
                  <div className="rounded-lg border border-pink-500/40 bg-pink-500 px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold font-mono-num text-white shadow-sm whitespace-nowrap">
                    Тыгыдык x2 · {zoomiesActiveLeft}с
                  </div>
                )}

                {flashSaleActive && (
                  <div className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-[#0FA968] px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold font-mono-num text-white shadow-sm whitespace-nowrap">
                    <Tag className="h-3 w-3 shrink-0" />
                    <span>Скидка -30% · {flashSaleLeft}с</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Desktop Full Toolbar + Mobile Compact Toolbar */}
            <div className="pointer-events-auto relative flex flex-col items-end gap-1.5 shrink-0">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setActiveModal('fortune');
                  }}
                  className={`flex min-h-[40px] items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-bold shadow-sm transition-opacity hover:opacity-90 whitespace-nowrap ${
                    fortuneAttention
                      ? 'bg-amber-500 text-slate-950 border-amber-600/20'
                      : hudSurface
                  }`}
                >
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Удача</span>
                  {state.spinTickets > 0 && (
                    <span className="font-mono-num">· {state.spinTickets}</span>
                  )}
                </button>

                {/* Desktop/Laptop Direct Buttons */}
                <button
                  onClick={() => setActiveModal('catalog')}
                  className={`hidden md:flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap ${hudSurface}`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Каталог</span>
                  {unclaimedCatalogCount > 0 && (
                    <span className="font-mono-num text-emerald-600 dark:text-emerald-400 font-bold">
                      · {unclaimedCatalogCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveModal('missions')}
                  className={`hidden md:flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap ${hudSurface}`}
                >
                  <Award className="h-4 w-4" />
                  <span>Задания</span>
                  {unclaimedMissionCount > 0 && (
                    <span className="font-mono-num text-emerald-600 dark:text-emerald-400 font-bold">
                      · {unclaimedMissionCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setActiveModal('shop');
                  }}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#3B66F5] px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#2E55DC] transition-colors whitespace-nowrap"
                >
                  <ShoppingBag className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Магазин</span>
                </button>

                <button
                  onClick={cycleAsmrMode}
                  className={`hidden md:flex min-h-[40px] items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors whitespace-nowrap ${
                    state.asmrMode !== 'off' ? hudSurface : 'opacity-55 ' + hudSurface
                  }`}
                  title="Переключить релакс-анимацию сбоку (Мыло / Поп-Кубы / Выкл)"
                >
                  <Scissors className="h-4 w-4 text-pink-500" />
                  <span className="hidden xl:inline">
                    {state.asmrMode === 'soap'
                      ? 'Мыло'
                      : state.asmrMode === 'pop'
                        ? 'Поп-Ит'
                        : 'Релакс выкл'}
                  </span>
                </button>

                <button
                  onClick={() =>
                    setState((prev) => ({ ...prev, ambientEnabled: !prev.ambientEnabled }))
                  }
                  className={`hidden md:flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-colors ${
                    state.ambientEnabled && !state.muted
                      ? 'bg-[#3B66F5] text-white border-[#3B66F5]'
                      : hudSurface
                  }`}
                  title={state.ambientEnabled ? 'Выключить эмбиент' : 'Включить вайбовый эмбиент'}
                  aria-label="Переключить эмбиент-музыку"
                >
                  <Music className="h-4 w-4" />
                </button>

                <button
                  onClick={() =>
                    setState((prev) => ({ ...prev, ps2Filter: !prev.ps2Filter }))
                  }
                  className={`hidden lg:flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold shadow-sm transition-colors whitespace-nowrap ${
                    state.ps2Filter
                      ? 'bg-[#3B66F5] text-white border-[#3B66F5]'
                      : hudSurface
                  }`}
                  title="Переключить ретро PS2-режим"
                >
                  <Monitor className="h-4 w-4" />
                  <span className="hidden xl:inline">PS2</span>
                </button>

                <button
                  onClick={() => sceneRef.current?.toggleCameraAngle()}
                  className={`hidden md:flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-opacity hover:opacity-85 ${hudSurface}`}
                  title="Сменить ракурс камеры"
                  aria-label="Сменить ракурс камеры"
                >
                  <Camera className="h-4 w-4" />
                </button>

                <button
                  onClick={() => setState((prev) => ({ ...prev, muted: !prev.muted }))}
                  className={`hidden md:flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-opacity hover:opacity-85 ${hudSurface}`}
                  title={state.muted ? 'Включить звук' : 'Выключить звук'}
                  aria-label={state.muted ? 'Включить звук' : 'Выключить звук'}
                >
                  {state.muted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>

                <button
                  onClick={() => setState((prev) => ({ ...prev, tutorialStep: 0 }))}
                  className={`hidden md:flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-opacity hover:opacity-85 ${hudSurface}`}
                  title="Показать обучение"
                  aria-label="Показать обучение"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>

                {/* Mobile Compact Menu Button (< md: iPhones & Androids) */}
                <button
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className={`md:hidden relative flex h-[40px] items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold shadow-sm ${hudSurface}`}
                  aria-label="Открыть меню"
                  title="Меню"
                >
                  {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                  {totalMenuAlerts > 0 && !mobileMenuOpen && (
                    <span className="font-mono-num text-[11px] font-bold text-emerald-500">
                      {totalMenuAlerts}
                    </span>
                  )}
                </button>

                {/* Collapse Top Panel Button (All Devices) */}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setTopCollapsed(true);
                  }}
                  className={`flex h-[40px] w-[40px] items-center justify-center rounded-xl border shadow-sm transition-opacity hover:opacity-85 ${hudSurface}`}
                  title="Скрыть верхнюю панель"
                  aria-label="Скрыть верхнюю панель"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
              </div>

              {/* Mobile Compact Popover Menu (Only opens when tapped) */}
              {mobileMenuOpen && (
                <div
                  className={`md:hidden w-[238px] rounded-2xl border p-2 shadow-xl grid grid-cols-2 gap-1.5 ${hudSurface}`}
                >
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setActiveModal('catalog');
                    }}
                    className="flex min-h-[42px] items-center gap-2 rounded-xl border border-current/10 px-2.5 text-xs font-semibold hover:bg-current/5"
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    <span>Каталог</span>
                    {unclaimedCatalogCount > 0 && (
                      <span className="ml-auto font-mono-num text-emerald-500 font-bold">
                        {unclaimedCatalogCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setActiveModal('missions');
                    }}
                    className="flex min-h-[42px] items-center gap-2 rounded-xl border border-current/10 px-2.5 text-xs font-semibold hover:bg-current/5"
                  >
                    <Award className="h-4 w-4 shrink-0" />
                    <span>Задания</span>
                    {unclaimedMissionCount > 0 && (
                      <span className="ml-auto font-mono-num text-emerald-500 font-bold">
                        {unclaimedMissionCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={cycleAsmrMode}
                    className="flex min-h-[42px] items-center gap-2 rounded-xl border border-current/10 px-2.5 text-xs font-semibold hover:bg-current/5"
                  >
                    <Scissors className="h-4 w-4 text-pink-500 shrink-0" />
                    <span>
                      {state.asmrMode === 'soap'
                        ? 'Мыло'
                        : state.asmrMode === 'pop'
                          ? 'Поп-Ит'
                          : 'Выкл'}
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        ambientEnabled: !prev.ambientEnabled,
                      }))
                    }
                    className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-2.5 text-xs font-semibold ${
                      state.ambientEnabled && !state.muted
                        ? 'border-[#3B66F5] bg-[#3B66F5]/15 text-[#3B66F5] dark:text-[#60A5FA]'
                        : 'border-current/10'
                    }`}
                  >
                    <Music className="h-4 w-4 shrink-0" />
                    <span>Эмбиент</span>
                  </button>

                  <button
                    onClick={() =>
                      setState((prev) => ({ ...prev, ps2Filter: !prev.ps2Filter }))
                    }
                    className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-2.5 text-xs font-semibold ${
                      state.ps2Filter
                        ? 'border-[#3B66F5] bg-[#3B66F5]/15 text-[#3B66F5] dark:text-[#60A5FA]'
                        : 'border-current/10'
                    }`}
                  >
                    <Monitor className="h-4 w-4 shrink-0" />
                    <span>PS2</span>
                  </button>

                  <button
                    onClick={() => {
                      sceneRef.current?.toggleCameraAngle();
                      setMobileMenuOpen(false);
                    }}
                    className="flex min-h-[42px] items-center gap-2 rounded-xl border border-current/10 px-2.5 text-xs font-semibold hover:bg-current/5"
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>Ракурс</span>
                  </button>

                  <button
                    onClick={() =>
                      setState((prev) => ({ ...prev, muted: !prev.muted }))
                    }
                    className="flex min-h-[42px] items-center gap-2 rounded-xl border border-current/10 px-2.5 text-xs font-semibold hover:bg-current/5"
                  >
                    {state.muted ? (
                      <VolumeX className="h-4 w-4 shrink-0" />
                    ) : (
                      <Volume2 className="h-4 w-4 shrink-0" />
                    )}
                    <span>{state.muted ? 'Без звука' : 'Звук'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setState((prev) => ({ ...prev, tutorialStep: 0 }));
                    }}
                    className="flex min-h-[42px] items-center gap-2 rounded-xl border border-current/10 px-2.5 text-xs font-semibold hover:bg-current/5"
                  >
                    <HelpCircle className="h-4 w-4 shrink-0" />
                    <span>Обучение</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Simple Beginner Onboarding Tutorial (Steps 0, 1, 2) */}
      {state.tutorialStep < 3 && (
        <div
          className={`pointer-events-none fixed left-1/2 z-25 w-[92vw] max-w-md -translate-x-1/2 transition-all ${
            dockCollapsed
              ? 'bottom-[max(3.5rem,calc(2.75rem+env(safe-area-inset-bottom)))]'
              : 'bottom-[max(6.75rem,calc(6rem+env(safe-area-inset-bottom)))] sm:bottom-28'
          }`}
        >
          <div
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-xl ${hudSurface}`}
          >
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[#3B66F5] dark:text-[#60A5FA]">
                Обучение · Шаг {state.tutorialStep + 1} из 3
              </div>
              <div className="text-xs sm:text-sm font-semibold leading-snug mt-0.5">
                {state.tutorialStep === 0 &&
                  'Перетащи одного Котёнка Моти на другого, чтобы объединить их!'}
                {state.tutorialStep === 1 &&
                  'Нажми на подарочную коробку на доске, чтобы открыть кота!'}
                {state.tutorialStep === 2 &&
                  'Нажимай на резку мыла для релакса, лови Золотую Мышь и крути Колесо Удачи!'}
              </div>
            </div>
            {state.tutorialStep < 2 ? (
              <button
                onClick={() =>
                  setState((prev) => ({ ...prev, tutorialStep: prev.tutorialStep + 1 }))
                }
                className="shrink-0 rounded-lg border border-current/15 px-3 py-1.5 text-xs font-semibold hover:bg-current/5 transition-colors whitespace-nowrap"
              >
                Дальше
              </button>
            ) : (
              <button
                onClick={handleFinishTutorial}
                className="shrink-0 rounded-lg bg-[#0FA968] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#0C8E57] transition-colors whitespace-nowrap"
              >
                Погнали! (+20 С)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active Golden Mouse Callout */}
      {mouseOnBoard && (
        <div
          className={`pointer-events-none fixed left-1/2 z-20 -translate-x-1/2 ${
            topCollapsed
              ? 'top-[max(0.75rem,env(safe-area-inset-top))]'
              : 'top-[max(5.5rem,calc(4.75rem+env(safe-area-inset-top)))] sm:top-20'
          }`}
        >
          <div className="flex items-center gap-2 rounded-xl border border-amber-600/30 bg-amber-400 px-3.5 py-1.5 text-xs font-extrabold text-slate-950 shadow-lg whitespace-nowrap">
            <MousePointerClick className="h-4 w-4" />
            <span>Золотая Мышь на доске — нажми на неё!</span>
          </div>
        </div>
      )}

      {/* World-Projected Floating Coin / Merge / Quip Popups */}
      <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
        {floatingEvents.map((ev) => (
          <div
            key={ev.id}
            style={{ left: ev.x, top: ev.y }}
            className="animate-float-up absolute text-center"
          >
            <div
              className={`font-display text-sm font-extrabold font-mono-num drop-shadow-sm whitespace-nowrap ${
                ev.tone === 'merge'
                  ? 'text-[#3B66F5] dark:text-[#60A5FA]'
                  : ev.tone === 'mouse' || ev.tone === 'gem'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-500'
              }`}
            >
              {ev.text}
            </div>
            {ev.subtext && (
              <div className="mt-0.5 rounded-md bg-white/95 dark:bg-slate-900/95 px-2 py-0.5 text-[11px] font-bold text-slate-800 dark:text-white shadow-sm whitespace-nowrap">
                {ev.subtext}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Transient Toast Banner */}
      {toastMsg && (
        <div
          className={`pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 max-w-[92vw] ${
            topCollapsed
              ? 'top-[max(3rem,calc(2.5rem+env(safe-area-inset-top)))]'
              : 'top-[max(7.5rem,calc(6.75rem+env(safe-area-inset-top)))] sm:top-28'
          }`}
        >
          <div
            className={`animate-pop-in rounded-xl border px-4 py-2 text-xs font-semibold shadow-lg text-center ${hudSurface}`}
          >
            {toastMsg}
          </div>
        </div>
      )}

      {/* Collapsible Unified Bottom Action Dock (Touch-Friendly & Responsive) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center px-2.5 sm:px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
        {/* Optional Stray Elite Cat Rewarded Ad Opportunity */}
        {strayCatActive && state.tutorialStep >= 2 && (
          <button
            onClick={() =>
              openRewardedAd({
                id: 'bonus_cat',
                title: 'Заблудившийся Элитный Кот',
                description: `Посмотри короткий ролик, чтобы сразу получить Кота Ур. ${Math.min(12, spawnLevel + 2)} на доску!`,
                rewardLabel: `Кот Ур. ${Math.min(12, spawnLevel + 2)} сразу на доску`,
              })
            }
            className="pointer-events-auto mb-1.5 flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500 px-3.5 py-1.5 text-xs font-extrabold text-slate-950 shadow-lg hover:bg-amber-400 transition-colors whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 fill-current shrink-0" />
            <span>
              Бонус: Кот Ур. {Math.min(12, spawnLevel + 2)} (Рекл)
            </span>
          </button>
        )}

        <button
          onClick={() => setDockCollapsed((c) => !c)}
          className={`pointer-events-auto mb-1 flex items-center gap-1 rounded-lg border px-3 py-1 text-[11px] font-semibold shadow-sm ${hudSurface}`}
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Панель</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Скрыть</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div
            className={`pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 rounded-2xl border p-1.5 sm:p-2.5 shadow-lg max-w-[96vw] ${hudSurface}`}
          >
            {/* Primary Buy Cat CTA with Live Affordability Progress */}
            <button
              onClick={() => handleBuyCat(spawnLevel)}
              className={`relative overflow-hidden flex min-h-[44px] items-center gap-2 rounded-xl px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
                state.coins >= spawnCost && hasEmptySlot
                  ? flashSaleActive
                    ? 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
                    : 'bg-[#3B66F5] text-white hover:bg-[#2E55DC]'
                  : 'bg-current/12 opacity-75 hover:opacity-90'
              }`}
            >
              {state.coins < spawnCost && (
                <span
                  className="absolute inset-y-0 left-0 bg-[#3B66F5]/20 transition-all duration-200 pointer-events-none"
                  style={{ width: `${spawnBuyProgressPct}%` }}
                />
              )}
              <Plus className="relative h-4 w-4 shrink-0" />
              <span className="relative">Кот Ур. {spawnLevel}</span>
              <span className="relative font-mono-num text-xs opacity-90">
                · {formatCoins(spawnCost)} М{flashSaleActive ? ' -30%' : ''}
              </span>
            </button>

            {/* Auto-Merge Button */}
            <button
              disabled={!canAutoMerge}
              onClick={handleAutoMerge}
              className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 sm:px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
                canAutoMerge
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
                  : 'border-current/10 opacity-40 cursor-not-allowed'
              }`}
            >
              <Zap className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Авто-слияние</span>
              <span className="sm:hidden">Слить</span>
              <span className="font-mono-num">
                {state.autoMergeCharges > 0
                  ? `(${state.autoMergeCharges})`
                  : state.gems >= 10
                    ? '· 10С'
                    : '· Рекл'}
              </span>
            </button>

            {/* Rewarded Ad: Crate & Cat Frenzy */}
            <button
              disabled={crateFrenzyCooldownLeft > 0}
              onClick={() =>
                openRewardedAd({
                  id: 'crate_frenzy',
                  title: 'Дождь Посылок и Котов',
                  description:
                    'Посмотри ролик и сразу высади до 5 котов и подарочных коробок на пустые клетки для быстрых слияний!',
                  rewardLabel: 'До +5 Котов/Коробок сразу',
                })
              }
              className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
                crateFrenzyCooldownLeft === 0
                  ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/25'
                  : 'border-current/10 opacity-45 cursor-not-allowed'
              }`}
              title="Получить волну котов и посылок за просмотр рекламы"
            >
              <Gift className="h-4 w-4 shrink-0" />
              <span className="font-mono-num">
                {crateFrenzyCooldownLeft > 0
                  ? `${crateFrenzyCooldownLeft}с`
                  : 'Посылки (Рекл)'}
              </span>
            </button>

            {/* Rewarded Ad Boost x2 */}
            <button
              disabled={doubleActive}
              onClick={() =>
                openRewardedAd({
                  id: 'double_income',
                  title: 'x2 Доход на 2 мин',
                  description:
                    'Посмотри короткий ролик: удвой доход котов и скорость появления посылок на 2 минуты (120с) + получи мгновенный бонус монет!',
                  rewardLabel: 'x2 Доход и Посылки на 2 минуты',
                })
              }
              className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2.5 text-xs font-bold transition-all active:scale-[0.97] whitespace-nowrap ${
                doubleActive
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
              }`}
            >
              <Play className="h-3.5 w-3.5 fill-current shrink-0" />
              <span>
                {doubleActive ? `x2 (${doubleSecondsLeft}с)` : 'x2 Доход на 2 мин'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <GameModals
        activeModal={activeModal}
        state={state}
        isDark={isDark}
        offlineCoins={offlineCoins}
        adOffer={adOffer}
        canClaimDaily={canClaimDaily}
        onClose={() => setActiveModal(null)}
        onBuyCatLevel={(lvl) => handleBuyCat(lvl, true)}
        onBuyUpgrade={handleBuyUpgrade}
        onBuyTheme={handleBuyTheme}
        onBuyVipPack={handleBuyVipPack}
        onBuyGemPack={(gems) => handleBuyGemPack(gems)}
        onClaimDiscovery={handleClaimDiscovery}
        onClaimMission={handleClaimMission}
        onClaimDailyMission={handleClaimDailyMission}
        onClaimDailyChest={handleClaimDailyChest}
        onClaimOffline={handleClaimOffline}
        onCompleteAd={handleCompleteAd}
        onSpinWheelComplete={handleSpinWheelComplete}
        onWatchAdForTicket={() =>
          openRewardedAd({
            id: 'spin_ticket',
            title: 'Билет Колеса Удачи',
            description:
              'Посмотри короткий спонсорский ролик, чтобы получить бесплатный билет на Колесо Удачи!',
            rewardLabel: '+1 Билет Удачи',
          })
        }
        onClaimDaily={handleClaimDaily}
        onPrestige={handlePrestige}
      />
    </div>
  );
}
