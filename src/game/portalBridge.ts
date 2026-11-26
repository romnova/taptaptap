// Universal HTML5 Game Portal Bridge (Yandex Games, Poki, CrazyGames, itch.io / standalone)
// Safely detects host portal SDKs when embedded and falls back cleanly in standalone mode.

interface YandexSdk {
  adv?: {
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
  rewardedBreak?: () => Promise<boolean>;
}

interface CrazyGamesSdk {
  SDK?: {
    game?: {
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
          adError?: () => void;
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

  window.CrazyGames?.SDK?.game?.gameplayStart?.();
}

export function notifyGameplayStart(): void {
  if (typeof window === 'undefined') return;
  ysdkInstance?.features?.GameplayAPI?.start?.();
  if (pokiReady) window.PokiSDK?.gameplayStart?.();
  window.CrazyGames?.SDK?.game?.gameplayStart?.();
}

export function notifyGameplayStop(): void {
  if (typeof window === 'undefined') return;
  ysdkInstance?.features?.GameplayAPI?.stop?.();
  if (pokiReady) window.PokiSDK?.gameplayStop?.();
  window.CrazyGames?.SDK?.game?.gameplayStop?.();
}

export function notifyHappyTime(): void {
  if (typeof window === 'undefined') return;
  window.CrazyGames?.SDK?.game?.happytime?.();
}

export async function tryPortalRewardedVideo(
  onPauseAudio: (paused: boolean) => void,
): Promise<'rewarded' | 'declined' | 'unavailable'> {
  if (typeof window === 'undefined') return 'unavailable';

  // 1. Yandex Games Rewarded Video
  if (ysdkInstance?.adv?.showRewardedVideo) {
    return new Promise((resolve) => {
      let rewarded = false;
      ysdkInstance?.adv?.showRewardedVideo?.({
        callbacks: {
          onOpen: () => {
            onPauseAudio(true);
            notifyGameplayStop();
          },
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => {
            onPauseAudio(false);
            notifyGameplayStart();
            resolve(rewarded ? 'rewarded' : 'declined');
          },
          onError: () => {
            onPauseAudio(false);
            notifyGameplayStart();
            resolve('unavailable');
          },
        },
      });
    });
  }

  // 2. Poki Rewarded Break
  if (pokiReady && window.PokiSDK?.rewardedBreak) {
    try {
      onPauseAudio(true);
      notifyGameplayStop();
      const ok = await window.PokiSDK.rewardedBreak();
      onPauseAudio(false);
      notifyGameplayStart();
      return ok ? 'rewarded' : 'declined';
    } catch {
      onPauseAudio(false);
      notifyGameplayStart();
      return 'unavailable';
    }
  }

  // 3. CrazyGames Rewarded Ad
  if (window.CrazyGames?.SDK?.ad?.requestAd) {
    return new Promise((resolve) => {
      window.CrazyGames?.SDK?.ad?.requestAd?.('rewarded', {
        adStarted: () => {
          onPauseAudio(true);
          notifyGameplayStop();
        },
        adFinished: () => {
          onPauseAudio(false);
          notifyGameplayStart();
          resolve('rewarded');
        },
        adError: () => {
          onPauseAudio(false);
          notifyGameplayStart();
          resolve('unavailable');
        },
      });
    });
  }

  return 'unavailable';
}
