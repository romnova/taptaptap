// Yandex Games SDK Bridge (YaGames) with safe local fallback
// Strictly supports Yandex Games lifecycle (LoadingAPI, GameplayAPI, showFullscreenAdv, showRewardedVideo).

export interface YandexSdk {
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

declare global {
  interface Window {
    YaGames?: { init: () => Promise<YandexSdk> };
  }
}

let ysdkInstance: YandexSdk | null = null;
let ysdkInitPromise: Promise<YandexSdk | null> | null = null;
let loadingReadySent = false;
let gameplayActive = false;
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
    // Ignore storage restrictions in embedded iframes
  }
}

export async function initYandexSdk(): Promise<YandexSdk | null> {
  if (typeof window === 'undefined') return null;
  if (ysdkInstance) return ysdkInstance;
  if (ysdkInitPromise) return ysdkInitPromise;

  if (!window.YaGames?.init) {
    return null;
  }

  ysdkInitPromise = window.YaGames.init()
    .then((ysdk) => {
      ysdkInstance = ysdk;
      return ysdk;
    })
    .catch(() => {
      ysdkInstance = null;
      return null;
    });

  return ysdkInitPromise;
}

export function notifyYandexLoadingReady(): void {
  if (loadingReadySent) return;
  if (!ysdkInstance?.features?.LoadingAPI?.ready) return;
  loadingReadySent = true;
  try {
    ysdkInstance.features.LoadingAPI.ready();
  } catch {
    // Ignore SDK errors in local mode
  }
}

export function notifyGameplayStart(): void {
  if (gameplayActive) return;
  gameplayActive = true;
  try {
    ysdkInstance?.features?.GameplayAPI?.start?.();
  } catch {
    // Ignore SDK errors in local mode
  }
}

export function notifyGameplayStop(): void {
  if (!gameplayActive) return;
  gameplayActive = false;
  try {
    ysdkInstance?.features?.GameplayAPI?.stop?.();
  } catch {
    // Ignore SDK errors in local mode
  }
}

export function isYandexSdkReady(): boolean {
  return Boolean(ysdkInstance);
}

export async function showYandexFullscreenAd(
  onPauseChange: (paused: boolean) => void,
): Promise<boolean> {
  if (!ysdkInstance?.adv?.showFullscreenAdv) {
    return false;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (wasShown: boolean) => {
      if (settled) return;
      settled = true;
      onPauseChange(false);
      notifyGameplayStart();
      resolve(wasShown);
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

export async function showYandexRewardedVideo(
  onPauseChange: (paused: boolean) => void,
  onRewarded?: () => void,
): Promise<'rewarded' | 'declined' | 'unavailable'> {
  if (!ysdkInstance?.adv?.showRewardedVideo) {
    return 'unavailable';
  }

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
            onRewarded?.();
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
