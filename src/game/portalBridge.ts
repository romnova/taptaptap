// Universal HTML5 Game Portal Bridge (Yandex Games, CrazyGames, Poki, Standalone)
// Safely detects host portal SDKs when embedded and falls back cleanly in local/standalone mode.

interface YandexSdk {
  adv?: {
    showFullscreenAdv?: (opts: {
      callbacks: {
        onOpen?: () => void;
        onClose?: (wasShown?: boolean) => void;
        onError?: (err: unknown) => void;
      };
    }) => void;
    showRewardedVideo?: (opts: {
      callbacks: {
        onOpen?: () => void;
        onRewarded?: () => void;
        onClose?: () => void;
        onError?: (err: unknown) => void;
      };
    }) => void;
  };
  features?: {
    LoadingAPI?: {
      ready?: () => void;
    };
    GameplayAPI?: {
      start?: () => void;
      stop?: () => void;
    };
  };
}

interface PokiSdk {
  init?: () => Promise<void>;
  gameLoadingFinished?: () => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  commercialBreak?: () => Promise<void>;
  rewardedBreak?: () => Promise<boolean>;
}

interface CrazyGamesSdk {
  SDK?: {
    init?: () => Promise<void>;
    game?: {
      loadingStart?: () => void;
      loadingStop?: () => void;
      gameplayStart?: () => void;
      gameplayStop?: () => void;
      happytime?: () => void;
    };
    ad?: {
      requestAd?: (
        type: 'rewarded' | 'midgame',
        callbacks: {
          adStarted?: () => void;
          adFinished?: () => void;
          adError?: (err?: unknown) => void;
        },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    YaGames?: { init: () => Promise<YandexSdk> };
    PokiSDK?: PokiSdk;
    CrazyGames?: CrazyGamesSdk;
  }
}

let ysdkInstance: YandexSdk | null = null;
let pokiReady = false;
let crazyReady = false;
const memoryStorage = new Map<string, string>();

export function safeLoadStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

export function safeSaveStorage(key: string, value: string): void {
  memoryStorage.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / restricted iframe cookies
  }
}

export async function initPortalBridge(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Yandex Games SDK
  if (window.YaGames?.init) {
    try {
      ysdkInstance = await window.YaGames.init();
      ysdkInstance.features?.LoadingAPI?.ready?.();
      ysdkInstance.features?.GameplayAPI?.start?.();
      return;
    } catch {
      ysdkInstance = null;
    }
  }

  // 2. Poki SDK
  if (window.PokiSDK?.init) {
    try {
      await window.PokiSDK.init();
      pokiReady = true;
      window.PokiSDK.gameLoadingFinished?.();
      window.PokiSDK.gameplayStart?.();
      return;
    } catch {
      pokiReady = false;
    }
  }

  // 3. CrazyGames SDK v3
  if (window.CrazyGames?.SDK) {
    try {
      if (window.CrazyGames.SDK.init) {
        await window.CrazyGames.SDK.init();
      }
      crazyReady = true;
      window.CrazyGames.SDK.game?.loadingStop?.();
      window.CrazyGames.SDK.game?.gameplayStart?.();
    } catch {
      crazyReady = false;
    }
  }
}

export function notifyGameplayStart(): void {
  if (typeof window === 'undefined') return;
  try {
    ysdkInstance?.features?.GameplayAPI?.start?.();
    if (pokiReady) window.PokiSDK?.gameplayStart?.();
    if (crazyReady) window.CrazyGames?.SDK?.game?.gameplayStart?.();
  } catch {
    // Ignore SDK errors in local/offline runs
  }
}

export function notifyGameplayStop(): void {
  if (typeof window === 'undefined') return;
  try {
    ysdkInstance?.features?.GameplayAPI?.stop?.();
    if (pokiReady) window.PokiSDK?.gameplayStop?.();
    if (crazyReady) window.CrazyGames?.SDK?.game?.gameplayStop?.();
  } catch {
    // Ignore SDK errors in local/offline runs
  }
}

export function notifyHappyTime(): void {
  if (typeof window === 'undefined') return;
  try {
    if (crazyReady) window.CrazyGames?.SDK?.game?.happytime?.();
  } catch {
    // Ignore SDK errors
  }
}

export async function tryPortalInterstitialAd(
  onPauseChange: (paused: boolean) => void,
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Yandex Games Fullscreen Interstitial Ad
  if (ysdkInstance?.adv?.showFullscreenAdv) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (shown: boolean) => {
        if (settled) return;
        settled = true;
        onPauseChange(false);
        notifyGameplayStart();
        resolve(shown);
      };

      try {
        ysdkInstance?.adv?.showFullscreenAdv?.({
          callbacks: {
            onOpen: () => {
              onPauseChange(true);
              notifyGameplayStop();
            },
            onClose: (wasShown) => {
              finish(Boolean(wasShown));
            },
            onError: () => {
              finish(false);
            },
          },
        });
      } catch {
        finish(false);
      }
    });
  }

  // 2. CrazyGames Midgame Interstitial Ad
  if (crazyReady && window.CrazyGames?.SDK?.ad?.requestAd) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (shown: boolean) => {
        if (settled) return;
        settled = true;
        onPauseChange(false);
        notifyGameplayStart();
        resolve(shown);
      };

      try {
        window.CrazyGames?.SDK?.ad?.requestAd?.('midgame', {
          adStarted: () => {
            onPauseChange(true);
            notifyGameplayStop();
          },
          adFinished: () => {
            finish(true);
          },
          adError: () => {
            finish(false);
          },
        });
      } catch {
        finish(false);
      }
    });
  }

  // 3. Poki Commercial Break
  if (pokiReady && window.PokiSDK?.commercialBreak) {
    try {
      onPauseChange(true);
      notifyGameplayStop();
      await window.PokiSDK.commercialBreak();
      onPauseChange(false);
      notifyGameplayStart();
      return true;
    } catch {
      onPauseChange(false);
      notifyGameplayStart();
      return false;
    }
  }

  return false;
}

export async function tryPortalRewardedVideo(
  onPauseChange: (paused: boolean) => void,
): Promise<'rewarded' | 'declined' | 'unavailable'> {
  if (typeof window === 'undefined') return 'unavailable';

  // 1. Yandex Games Rewarded Video
  if (ysdkInstance?.adv?.showRewardedVideo) {
    return new Promise((resolve) => {
      let rewarded = false;
      let settled = false;
      const finish = (result: 'rewarded' | 'declined' | 'unavailable') => {
        if (settled) return;
        settled = true;
        onPauseChange(false);
        notifyGameplayStart();
        resolve(result);
      };

      try {
        ysdkInstance?.adv?.showRewardedVideo?.({
          callbacks: {
            onOpen: () => {
              onPauseChange(true);
              notifyGameplayStop();
            },
            onRewarded: () => {
              rewarded = true;
            },
            onClose: () => {
              finish(rewarded ? 'rewarded' : 'declined');
            },
            onError: () => {
              finish('unavailable');
            },
          },
        });
      } catch {
        finish('unavailable');
      }
    });
  }

  // 2. Poki Rewarded Break
  if (pokiReady && window.PokiSDK?.rewardedBreak) {
    try {
      onPauseChange(true);
      notifyGameplayStop();
      const ok = await window.PokiSDK.rewardedBreak();
      onPauseChange(false);
      notifyGameplayStart();
      return ok ? 'rewarded' : 'declined';
    } catch {
      onPauseChange(false);
      notifyGameplayStart();
      return 'unavailable';
    }
  }

  // 3. CrazyGames Rewarded Ad
  if (crazyReady && window.CrazyGames?.SDK?.ad?.requestAd) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: 'rewarded' | 'declined' | 'unavailable') => {
        if (settled) return;
        settled = true;
        onPauseChange(false);
        notifyGameplayStart();
        resolve(result);
      };

      try {
        window.CrazyGames?.SDK?.ad?.requestAd?.('rewarded', {
          adStarted: () => {
            onPauseChange(true);
            notifyGameplayStop();
          },
          adFinished: () => {
            finish('rewarded');
          },
          adError: () => {
            finish('unavailable');
          },
        });
      } catch {
        finish('unavailable');
      }
    });
  }

  return 'unavailable';
}
