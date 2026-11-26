import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Coins,
  Fish,
  Gem,
  Gift,
  Play,
  RotateCw,
  Sparkles,
  Ticket,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import {
  BOARD_THEMES,
  CAT_TIERS,
  DAILY_MISSIONS,
  DAILY_REWARDS,
  MISSIONS,
  WHEEL_SECTORS,
  formatCoins,
  getCatPurchasePrice,
  getPendingGoldenFish,
  getUpgradeCost,
} from '../game/catData';
import {
  ActiveModal,
  BoardThemeId,
  GameState,
  RewardedAdOffer,
  WheelSector,
} from '../game/types';

interface GameModalsProps {
  activeModal: ActiveModal;
  state: GameState;
  isDark: boolean;
  offlineCoins: number;
  adOffer: RewardedAdOffer | null;
  canClaimDaily: boolean;
  onClose: () => void;
  onBuyCatLevel: (level: number) => void;
  onBuyUpgrade: (kind: 'spawnLevel' | 'incomeMultiplierLevel' | 'crateSpeedLevel') => void;
  onBuyTheme: (themeId: BoardThemeId) => void;
  onBuyVipPack: () => void;
  onBuyGemPack: (gems: number) => void;
  onClaimDiscovery: (level: number) => void;
  onClaimMission: (missionId: string) => void;
  onClaimDailyMission: (missionId: string) => void;
  onClaimDailyChest: () => void;
  onClaimOffline: (doubled: boolean) => void;
  onCompleteAd: () => void;
  onSpinWheelComplete: (sector: WheelSector, method: 'ticket' | 'gems') => void;
  onWatchAdForTicket: () => void;
  onClaimDaily: () => void;
  onPrestige: () => void;
}

export const GameModals: React.FC<GameModalsProps> = ({
  activeModal,
  state,
  isDark,
  offlineCoins,
  adOffer,
  canClaimDaily,
  onClose,
  onBuyCatLevel,
  onBuyUpgrade,
  onBuyTheme,
  onBuyVipPack,
  onBuyGemPack,
  onClaimDiscovery,
  onClaimMission,
  onClaimDailyMission,
  onClaimDailyChest,
  onClaimOffline,
  onCompleteAd,
  onSpinWheelComplete,
  onWatchAdForTicket,
  onClaimDaily,
  onPrestige,
}) => {
  const [shopTab, setShopTab] = useState<'upgrades' | 'cats' | 'vip'>('upgrades');
  const [fortuneTab, setFortuneTab] = useState<'wheel' | 'daily' | 'prestige'>('wheel');
  const [missionsTab, setMissionsTab] = useState<'daily' | 'achievements'>('daily');
  const [adSecondsLeft, setAdSecondsLeft] = useState(3);

  // Wheel animation state
  const [spinning, setSpinning] = useState(false);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [lastWonSector, setLastWonSector] = useState<WheelSector | null>(null);
  const spinTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeModal !== 'ad') return;
    setAdSecondsLeft(3);
    const timer = window.setInterval(() => {
      setAdSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeModal, adOffer?.id]);

  if (!activeModal) return null;

  const surface = isDark
    ? 'bg-[#1B2030] text-[#F1F5F9] border-white/12'
    : 'bg-[#FFFFFF] text-[#171B26] border-slate-900/10';
  const subSurface = isDark
    ? 'bg-[#242B40] border-white/10'
    : 'bg-[#F4F6FA] border-slate-900/8';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-500';

  const startWheelSpin = (method: 'ticket' | 'gems') => {
    if (spinning) return;
    if (method === 'ticket' && state.spinTickets <= 0) return;
    if (method === 'gems' && state.gems < 15) return;

    const sectorCount = WHEEL_SECTORS.length;
    const chosenIdx = Math.floor(Math.random() * sectorCount);
    const sectorAngle = 360 / sectorCount;
    // Align chosen sector center under top pointer (0 deg)
    const targetSectorCenter = chosenIdx * sectorAngle + sectorAngle / 2;
    const extraTurns = 360 * 5;
    const currentMod = wheelAngle % 360;
    const deltaToZero = 360 - currentMod;
    const finalAngle = wheelAngle + deltaToZero + extraTurns + (360 - targetSectorCenter);

    setLastWonSector(null);
    setSpinning(true);
    setWheelAngle(finalAngle);

    let ticks = 0;
    const tickInterval = window.setInterval(() => {
      ticks++;
      soundEngine.playWheelTick();
      if (ticks >= 14) window.clearInterval(tickInterval);
    }, 180);

    spinTimerRef.current = window.setTimeout(() => {
      window.clearInterval(tickInterval);
      setSpinning(false);
      const won = WHEEL_SECTORS[chosenIdx];
      setLastWonSector(won);
      onSpinWheelComplete(won, method);
    }, 2900);
  };

  const pendingFish = getPendingGoldenFish(
    state.highestUnlockedLevel,
    state.totalMerges,
  );

  // Conic gradient for 6 sectors
  const conicStops = WHEEL_SECTORS.map((s, idx) => {
    const start = (idx / WHEEL_SECTORS.length) * 100;
    const end = ((idx + 1) / WHEEL_SECTORS.length) * 100;
    return `${s.color} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && activeModal !== 'ad' && !spinning) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full max-w-xl rounded-xl border shadow-2xl overflow-hidden ${surface}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-current/10">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {activeModal === 'shop' && 'Магазин и улучшения'}
            {activeModal === 'catalog' && 'Каталог котов'}
            {activeModal === 'missions' && 'Задания'}
            {activeModal === 'fortune' && 'Удача, Бонусы и Престиж'}
            {activeModal === 'offline' && 'С возвращением!'}
            {activeModal === 'ad' && (adOffer?.title ?? 'Видео-бонус')}
          </h2>
          {activeModal !== 'ad' && !spinning && (
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-current/10 transition-colors"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[75vh] overflow-y-auto p-5">
          {activeModal === 'fortune' && (
            <div className="space-y-5">
              {/* Tabs */}
              <div className={`grid grid-cols-3 gap-1 rounded-lg p-1 border ${subSurface}`}>
                <button
                  disabled={spinning}
                  onClick={() => setFortuneTab('wheel')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    fortuneTab === 'wheel'
                      ? 'bg-[#3B66F5] text-white'
                      : `${mutedText} hover:text-current`
                  }`}
                >
                  Колесо Удачи
                </button>
                <button
                  disabled={spinning}
                  onClick={() => setFortuneTab('daily')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    fortuneTab === 'daily'
                      ? 'bg-[#3B66F5] text-white'
                      : `${mutedText} hover:text-current`
                  }`}
                >
                  Бонус дня {canClaimDaily ? '· !' : ''}
                </button>
                <button
                  disabled={spinning}
                  onClick={() => setFortuneTab('prestige')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    fortuneTab === 'prestige'
                      ? 'bg-[#3B66F5] text-white'
                      : `${mutedText} hover:text-current`
                  }`}
                >
                  Нирвана
                </button>
              </div>

              {fortuneTab === 'wheel' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-xs font-medium opacity-75">
                    Билетов: <span className="font-mono-num font-bold">{state.spinTickets}</span> ·
                    Лови Золотых Мышей на доске ради билетов!
                  </div>

                  {/* Wheel Visual */}
                  <div className="relative h-60 w-60 flex items-center justify-center">
                    {/* Top Pointer */}
                    <div
                      className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-[#171B26] dark:border-t-white drop-shadow"
                    />
                    <div
                      className="h-56 w-56 rounded-full border-4 border-slate-900/20 shadow-lg relative overflow-hidden"
                      style={{
                        background: `conic-gradient(${conicStops})`,
                        transform: `rotate(${wheelAngle}deg)`,
                        transition: spinning
                          ? 'transform 2.85s cubic-bezier(0.12, 0.85, 0.2, 1)'
                          : 'none',
                      }}
                    >
                      {WHEEL_SECTORS.map((sec, idx) => {
                        const deg =
                          (idx * 360) / WHEEL_SECTORS.length +
                          180 / WHEEL_SECTORS.length;
                        return (
                          <div
                            key={sec.id}
                            className="absolute inset-0 flex justify-center pt-4 pointer-events-none"
                            style={{ transform: `rotate(${deg}deg)` }}
                          >
                            <span
                              className="text-[10px] font-extrabold tracking-tight text-center leading-tight max-w-[66px]"
                              style={{ color: sec.textColor }}
                            >
                              {sec.label}
                            </span>
                          </div>
                        );
                      })}
                      <div className="absolute top-1/2 left-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-slate-900/20 shadow flex items-center justify-center">
                        <RotateCw className="h-4 w-4 text-slate-800" />
                      </div>
                    </div>
                  </div>

                  {lastWonSector && (
                    <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      Выигрыш: {lastWonSector.label}!
                    </div>
                  )}

                  {/* Spin Controls */}
                  <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
                    <button
                      disabled={spinning || state.spinTickets <= 0}
                      onClick={() => startWheelSpin('ticket')}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                        !spinning && state.spinTickets > 0
                          ? 'bg-[#3B66F5] text-white hover:bg-[#2E55DC]'
                          : 'bg-current/10 opacity-45 cursor-not-allowed'
                      }`}
                    >
                      <Ticket className="h-4 w-4" />
                      <span>Крутить (1 билет)</span>
                    </button>

                    <button
                      disabled={spinning || state.gems < 15}
                      onClick={() => startWheelSpin('gems')}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                        !spinning && state.gems >= 15
                          ? 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
                          : 'bg-current/10 opacity-45 cursor-not-allowed'
                      }`}
                    >
                      <Gem className="h-4 w-4" />
                      <span>15 Самоцв.</span>
                    </button>

                    <button
                      disabled={spinning}
                      onClick={onWatchAdForTicket}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-current/15 text-xs font-semibold hover:bg-current/5 transition-colors"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>+1 Билет (Реклама)</span>
                    </button>
                  </div>
                </div>
              )}

              {fortuneTab === 'daily' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {DAILY_REWARDS.map((item, idx) => {
                      const isDone = idx < state.streakDay;
                      const isCurrent = idx === state.streakDay;
                      return (
                        <div
                          key={item.day}
                          className={`rounded-lg border p-3 text-center flex flex-col items-center justify-between gap-2 ${
                            isCurrent && canClaimDaily
                              ? 'border-[#3B66F5] bg-[#3B66F5]/10'
                              : subSurface
                          } ${isDone ? 'opacity-55' : ''}`}
                        >
                          <div className={`text-[11px] font-bold ${mutedText}`}>
                            День {item.day}
                          </div>
                          <Gift
                            className={`h-5 w-5 ${
                              isCurrent && canClaimDaily
                                ? 'text-[#3B66F5]'
                                : isDone
                                  ? 'text-emerald-500'
                                  : 'opacity-50'
                            }`}
                          />
                          <div className="text-xs font-bold leading-tight">{item.label}</div>
                          {isDone && (
                            <span className="text-[10px] font-semibold text-emerald-500">
                              Получено
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    disabled={!canClaimDaily}
                    onClick={onClaimDaily}
                    className={`w-full py-3 rounded-lg text-sm font-bold transition-colors ${
                      canClaimDaily
                        ? 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
                        : 'bg-current/10 opacity-45 cursor-not-allowed'
                    }`}
                  >
                    {canClaimDaily
                      ? `Забрать награду дня ${state.streakDay + 1}`
                      : 'Награда на сегодня уже получена'}
                  </button>
                </div>
              )}

              {fortuneTab === 'prestige' && (
                <div className="space-y-4 text-center py-2">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
                    <Fish className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-base">
                      Кото-Нирвана (Престиж)
                    </div>
                    <p className={`text-xs mt-1 max-w-md mx-auto ${mutedText}`}>
                      Сбрось доску и монеты, чтобы получить Золотых Рыбок. Каждая рыбка
                      увеличивает весь доход на <strong className="text-current">+50% навсегда</strong>!
                      Самоцветы, темы доски и билеты сохраняются.
                    </p>
                  </div>

                  <div className={`grid grid-cols-2 gap-3 rounded-lg border p-3.5 ${subSurface}`}>
                    <div>
                      <div className={`text-[11px] ${mutedText}`}>Сейчас рыбок</div>
                      <div className="font-mono-num font-bold text-lg">
                        {state.goldenFish} (+{state.goldenFish * 50}%)
                      </div>
                    </div>
                    <div>
                      <div className={`text-[11px] ${mutedText}`}>Получишь сейчас</div>
                      <div className="font-mono-num font-bold text-lg text-amber-500">
                        +{pendingFish}
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={pendingFish <= 0}
                    onClick={onPrestige}
                    className={`w-full py-3 rounded-lg text-sm font-bold transition-colors ${
                      pendingFish > 0
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        : 'bg-current/10 opacity-45 cursor-not-allowed'
                    }`}
                  >
                    {pendingFish > 0
                      ? `Переродиться (+${pendingFish} Золотых Рыбок)`
                      : 'Открой кота 6 ур. (Кибер-Кот) для Нирваны'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeModal === 'shop' && (
            <div className="space-y-4">
              {/* Segmented Tabs */}
              <div className={`grid grid-cols-3 gap-1 rounded-lg p-1 border ${subSurface}`}>
                <button
                  onClick={() => setShopTab('upgrades')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    shopTab === 'upgrades'
                      ? 'bg-[#3B66F5] text-white'
                      : `${mutedText} hover:text-current`
                  }`}
                >
                  Улучшения
                </button>
                <button
                  onClick={() => setShopTab('cats')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    shopTab === 'cats'
                      ? 'bg-[#3B66F5] text-white'
                      : `${mutedText} hover:text-current`
                  }`}
                >
                  Купить кота
                </button>
                <button
                  onClick={() => setShopTab('vip')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    shopTab === 'vip'
                      ? 'bg-[#3B66F5] text-white'
                      : `${mutedText} hover:text-current`
                  }`}
                >
                  VIP и Темы
                </button>
              </div>

              {shopTab === 'upgrades' && (
                <div className="space-y-3">
                  {/* Spawn Level Upgrade */}
                  {(() => {
                    const cost = getUpgradeCost('spawnLevel', state.upgrades.spawnLevel);
                    const maxed = state.upgrades.spawnLevel >= 8;
                    const canAfford = state.coins >= cost.amount && !maxed;
                    return (
                      <div className={`flex items-center justify-between gap-4 rounded-lg border p-3.5 ${subSurface}`}>
                        <div>
                          <div className="font-semibold text-sm">Уровень призыва</div>
                          <div className={`text-xs mt-0.5 ${mutedText}`}>
                            Сейчас: Ур. {state.upgrades.spawnLevel} · Новые коты сразу сильнее
                          </div>
                        </div>
                        <button
                          disabled={!canAfford}
                          onClick={() => onBuyUpgrade('spawnLevel')}
                          className={`shrink-0 px-4 py-2 rounded-lg text-xs font-bold font-mono-num transition-colors ${
                            canAfford
                              ? 'bg-[#3B66F5] text-white hover:bg-[#2E55DC]'
                              : 'bg-current/10 opacity-45 cursor-not-allowed'
                          }`}
                        >
                          {maxed ? 'МАКС.' : `${formatCoins(cost.amount)} М`}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Global Income Multiplier */}
                  {(() => {
                    const cost = getUpgradeCost(
                      'incomeMultiplierLevel',
                      state.upgrades.incomeMultiplierLevel,
                    );
                    const canAfford = state.coins >= cost.amount;
                    const bonusPct = (state.upgrades.incomeMultiplierLevel - 1) * 25;
                    return (
                      <div className={`flex items-center justify-between gap-4 rounded-lg border p-3.5 ${subSurface}`}>
                        <div>
                          <div className="font-semibold text-sm">Бонус дохода (+25%)</div>
                          <div className={`text-xs mt-0.5 ${mutedText}`}>
                            Ур. {state.upgrades.incomeMultiplierLevel} · Текущий бонус +{bonusPct}%
                          </div>
                        </div>
                        <button
                          disabled={!canAfford}
                          onClick={() => onBuyUpgrade('incomeMultiplierLevel')}
                          className={`shrink-0 px-4 py-2 rounded-lg text-xs font-bold font-mono-num transition-colors ${
                            canAfford
                              ? 'bg-[#3B66F5] text-white hover:bg-[#2E55DC]'
                              : 'bg-current/10 opacity-45 cursor-not-allowed'
                          }`}
                        >
                          {formatCoins(cost.amount)} М
                        </button>
                      </div>
                    );
                  })()}

                  {/* Crate Speed */}
                  {(() => {
                    const cost = getUpgradeCost(
                      'crateSpeedLevel',
                      state.upgrades.crateSpeedLevel,
                    );
                    const maxed = state.upgrades.crateSpeedLevel >= 6;
                    const canAfford = state.gems >= cost.amount && !maxed;
                    const interval = Math.max(4, 11 - state.upgrades.crateSpeedLevel);
                    return (
                      <div className={`flex items-center justify-between gap-4 rounded-lg border p-3.5 ${subSurface}`}>
                        <div>
                          <div className="font-semibold text-sm">Ускорение посылок</div>
                          <div className={`text-xs mt-0.5 ${mutedText}`}>
                            Бесплатный ящик каждые {interval} сек
                          </div>
                        </div>
                        <button
                          disabled={!canAfford}
                          onClick={() => onBuyUpgrade('crateSpeedLevel')}
                          className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold font-mono-num transition-colors ${
                            canAfford
                              ? 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
                              : 'bg-current/10 opacity-45 cursor-not-allowed'
                          }`}
                        >
                          {maxed ? (
                            'МАКС.'
                          ) : (
                            <>
                              <Gem className="h-3.5 w-3.5" />
                              {cost.amount}
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {shopTab === 'cats' && (
                <div className="space-y-2.5">
                  {state.flashSaleUntil > Date.now() && (
                    <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/12 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                      Счастливый купон: скидка -30% на всех котов прямо сейчас!
                    </div>
                  )}
                  {CAT_TIERS.filter((t) => t.level <= state.highestUnlockedLevel).map(
                    (tier) => {
                      const flashSaleOn = state.flashSaleUntil > Date.now();
                      const bought = state.purchasesPerLevel[tier.level] || 0;
                      const price = getCatPurchasePrice(tier.level, bought, flashSaleOn);
                      const canBuy =
                        state.coins >= price && state.board.some((slot) => slot === null);

                      return (
                        <div
                          key={tier.level}
                          className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${subSurface}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="h-9 w-9 shrink-0 rounded-lg border border-black/15"
                              style={{ backgroundColor: tier.bodyColor }}
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">
                                Ур. {tier.level} · {tier.name}
                              </div>
                              <div className={`text-xs font-mono-num ${mutedText}`}>
                                +{formatCoins(tier.incomePerSec)}/сек
                              </div>
                            </div>
                          </div>
                          <button
                            disabled={!canBuy}
                            onClick={() => onBuyCatLevel(tier.level)}
                            className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold font-mono-num transition-colors ${
                              canBuy
                                ? flashSaleOn
                                  ? 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
                                  : 'bg-[#3B66F5] text-white hover:bg-[#2E55DC]'
                                : 'bg-current/10 opacity-45 cursor-not-allowed'
                            }`}
                          >
                            {formatCoins(price)} М{flashSaleOn ? ' -30%' : ''}
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>
              )}

              {shopTab === 'vip' && (
                <div className="space-y-4">
                  {/* Starter VIP Pack */}
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-display font-bold text-sm text-amber-600 dark:text-amber-400">
                        Набор PS2 VIP Старт
                      </div>
                      <div className={`text-xs mt-1 ${mutedText}`}>
                        +150 Самоцветов · 5 Авто-слияний · 3 Билета · 25 000 Монет
                      </div>
                    </div>
                    <button
                      disabled={state.vipPackOwned}
                      onClick={onBuyVipPack}
                      className={`shrink-0 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                        state.vipPackOwned
                          ? 'bg-current/15 opacity-60 cursor-default'
                          : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      }`}
                    >
                      {state.vipPackOwned ? 'Куплено' : '199 ₽'}
                    </button>
                  </div>

                  {/* Gem Packs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-lg border p-3.5 flex flex-col justify-between gap-3 ${subSurface}`}>
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-sm">
                          <Gem className="h-4 w-4 text-emerald-500" />
                          <span>80 Самоцветов</span>
                        </div>
                        <div className={`text-xs mt-1 ${mutedText}`}>Горсть кристаллов</div>
                      </div>
                      <button
                        onClick={() => onBuyGemPack(80)}
                        className="w-full py-2 rounded-lg bg-[#0FA968] text-white text-xs font-bold hover:bg-[#0C8E57] transition-colors"
                      >
                        99 ₽
                      </button>
                    </div>
                    <div className={`rounded-lg border p-3.5 flex flex-col justify-between gap-3 ${subSurface}`}>
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-sm">
                          <Gem className="h-4 w-4 text-emerald-500" />
                          <span>350 Самоцветов</span>
                        </div>
                        <div className={`text-xs mt-1 ${mutedText}`}>Выгода +40%</div>
                      </div>
                      <button
                        onClick={() => onBuyGemPack(350)}
                        className="w-full py-2 rounded-lg bg-[#0FA968] text-white text-xs font-bold hover:bg-[#0C8E57] transition-colors"
                      >
                        299 ₽
                      </button>
                    </div>
                  </div>

                  {/* Board Themes */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider opacity-60">
                      Стиль 3D-доски
                    </div>
                    <div className="space-y-2">
                      {BOARD_THEMES.map((theme) => {
                        const isActive = state.themeId === theme.id;
                        const canBuy = theme.priceGems === 0 || state.gems >= theme.priceGems;
                        return (
                          <div
                            key={theme.id}
                            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${subSurface}`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="h-7 w-7 rounded-md border border-black/20"
                                style={{ backgroundColor: theme.bgHex }}
                              />
                              <span className="text-sm font-semibold">{theme.name}</span>
                            </div>
                            <button
                              disabled={isActive || !canBuy}
                              onClick={() => onBuyTheme(theme.id)}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                isActive
                                  ? 'bg-[#3B66F5]/20 text-[#3B66F5]'
                                  : canBuy
                                    ? 'bg-[#3B66F5] text-white hover:bg-[#2E55DC]'
                                    : 'bg-current/10 opacity-45 cursor-not-allowed'
                              }`}
                            >
                              {isActive
                                ? 'Активна'
                                : theme.priceGems === 0
                                  ? 'Выбрать'
                                  : `${theme.priceGems} С`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeModal === 'catalog' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAT_TIERS.map((tier) => {
                const unlocked = tier.level <= state.highestUnlockedLevel;
                const claimed = state.discoveredRewardsClaimed.includes(tier.level);
                return (
                  <div
                    key={tier.level}
                    className={`rounded-lg border p-3.5 flex items-center justify-between gap-3 ${subSurface} ${
                      unlocked ? '' : 'opacity-55'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="h-10 w-10 shrink-0 rounded-lg border border-black/15 flex items-center justify-center font-display font-bold text-xs text-slate-900"
                        style={{ backgroundColor: unlocked ? tier.bodyColor : '#94A3B8' }}
                      >
                        {tier.level}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {unlocked ? tier.name : 'Неизвестный кот'}
                        </div>
                        <div className={`text-xs truncate ${mutedText}`}>
                          {unlocked
                            ? `${tier.title} · +${formatCoins(tier.incomePerSec)}/с`
                            : 'Объединяй котов для открытия'}
                        </div>
                      </div>
                    </div>
                    {unlocked && !claimed && (
                      <button
                        onClick={() => onClaimDiscovery(tier.level)}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0FA968] text-white text-xs font-bold hover:bg-[#0C8E57] transition-colors"
                      >
                        <Gem className="h-3.5 w-3.5" />
                        +{tier.level * 5}
                      </button>
                    )}
                    {unlocked && claimed && (
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeModal === 'missions' && (
            <div className="space-y-4">
              {/* Segmented Tabs: Daily Missions vs Achievements */}
              <div className={`grid grid-cols-2 gap-1 rounded-lg p-1 border ${subSurface}`}>
                <button
                  onClick={() => setMissionsTab('daily')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    missionsTab === 'daily'
                      ? 'bg-[#3B66F5] text-white'
                      : `${mutedText} hover:text-current`
                  }`}
                >
                  Миссии дня
                </button>
                <button
                  onClick={() => setMissionsTab('achievements')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    missionsTab === 'achievements'
                      ? 'bg-[#3B66F5] text-white'
                      : `${mutedText} hover:text-current`
                  }`}
                >
                  Достижения
                </button>
              </div>

              {missionsTab === 'daily' && (() => {
                const completedCount = DAILY_MISSIONS.filter((dm) => {
                  const p = state.dailyProgress[dm.type] || 0;
                  return p >= dm.target;
                }).length;
                const chestReady =
                  completedCount >= DAILY_MISSIONS.length && !state.dailyChestClaimed;

                return (
                  <div className="space-y-3">
                    {/* Grand Daily Bonus Chest */}
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/12 p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display font-bold text-sm flex items-center gap-1.5 text-amber-600 dark:text-amber-300">
                          <Gift className="h-4 w-4 shrink-0" />
                          <span>Сундук дня ({completedCount}/{DAILY_MISSIONS.length})</span>
                        </div>
                        <div className={`text-xs mt-0.5 ${mutedText}`}>
                          Выполни все миссии дня: +60 Самоцветов и +1 Билет Удачи
                        </div>
                      </div>
                      <button
                        disabled={!chestReady}
                        onClick={onClaimDailyChest}
                        className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97] whitespace-nowrap ${
                          state.dailyChestClaimed
                            ? 'bg-current/10 opacity-50'
                            : chestReady
                              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                              : 'bg-current/10 opacity-45 cursor-not-allowed'
                        }`}
                      >
                        {state.dailyChestClaimed
                          ? 'Открыт'
                          : chestReady
                            ? 'Забрать!'
                            : `${completedCount}/${DAILY_MISSIONS.length}`}
                      </button>
                    </div>

                    {DAILY_MISSIONS.map((dm) => {
                      const progress = state.dailyProgress[dm.type] || 0;
                      const pct = Math.min(100, Math.round((progress / dm.target) * 100));
                      const claimed = state.dailyClaimedIds.includes(dm.id);
                      const ready = progress >= dm.target && !claimed;

                      return (
                        <div
                          key={dm.id}
                          className={`rounded-lg border p-3.5 flex items-center justify-between gap-4 ${subSurface}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">{dm.title}</div>
                            <div className="mt-2 h-2 w-full rounded-full bg-current/10 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  ready ? 'bg-[#0FA968]' : 'bg-[#3B66F5]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className={`text-xs font-mono-num mt-1 ${mutedText}`}>
                              {Math.min(progress, dm.target)} / {dm.target}
                            </div>
                          </div>
                          <button
                            disabled={!ready}
                            onClick={() => onClaimDailyMission(dm.id)}
                            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97] ${
                              claimed
                                ? 'bg-current/10 opacity-50'
                                : ready
                                  ? 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
                                  : 'bg-current/10 opacity-45 cursor-not-allowed'
                            }`}
                          >
                            <Gem className="h-3.5 w-3.5" />
                            {claimed
                              ? 'Получено'
                              : `+${dm.rewardGems}${dm.rewardTickets ? ` · +${dm.rewardTickets}Б` : ''}`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {missionsTab === 'achievements' && (
                <div className="space-y-3">
                  {MISSIONS.map((m) => {
                    const progress =
                      m.type === 'merges'
                        ? state.totalMerges
                        : m.type === 'maxLevel'
                          ? state.highestUnlockedLevel
                          : m.type === 'taps'
                            ? state.totalTaps
                            : m.type === 'mice'
                              ? state.totalMiceCaught
                              : state.totalCratesOpened;
                    const pct = Math.min(100, Math.round((progress / m.target) * 100));
                    const claimed = state.claimedMissions.includes(m.id);
                    const ready = progress >= m.target && !claimed;

                    return (
                      <div
                        key={m.id}
                        className={`rounded-lg border p-3.5 flex items-center justify-between gap-4 ${subSurface}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{m.title}</div>
                          <div className="mt-2 h-2 w-full rounded-full bg-current/10 overflow-hidden">
                            <div
                              className="h-full bg-[#3B66F5] transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className={`text-xs font-mono-num mt-1 ${mutedText}`}>
                            {Math.min(progress, m.target)} / {m.target}
                          </div>
                        </div>
                        <button
                          disabled={!ready}
                          onClick={() => onClaimMission(m.id)}
                          className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97] ${
                            claimed
                              ? 'bg-current/10 opacity-50'
                              : ready
                                ? 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
                                : 'bg-current/10 opacity-45 cursor-not-allowed'
                          }`}
                        >
                          <Gem className="h-3.5 w-3.5" />
                          {claimed ? 'Получено' : `+${m.rewardGems}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeModal === 'offline' && (
            <div className="text-center space-y-5 py-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
                <Coins className="h-7 w-7" />
              </div>
              <div>
                <div className={`text-sm ${mutedText}`}>
                  Пока тебя не было, твои 3D-коты заработали:
                </div>
                <div className="font-display font-extrabold text-3xl font-mono-num mt-1.5">
                  +{formatCoins(offlineCoins)}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => onClaimOffline(false)}
                  className="flex-1 py-3 px-4 rounded-lg border border-current/15 font-semibold text-sm hover:bg-current/5 transition-colors"
                >
                  Забрать
                </button>
                <button
                  onClick={() => onClaimOffline(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[#0FA968] text-white font-bold text-sm hover:bg-[#0C8E57] transition-colors"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Забрать x2 (Реклама)
                </button>
              </div>
            </div>
          )}

          {activeModal === 'ad' && adOffer && (
            <div className="text-center space-y-5 py-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#3B66F5]/15 text-[#3B66F5]">
                {adOffer.id === 'double_income' ? (
                  <TrendingUp className="h-8 w-8" />
                ) : adOffer.id === 'auto_merge' ? (
                  <Zap className="h-8 w-8" />
                ) : adOffer.id === 'crate_frenzy' ? (
                  <Gift className="h-8 w-8" />
                ) : (
                  <Sparkles className="h-8 w-8" />
                )}
              </div>
              <div>
                <div className="font-display font-bold text-base">{adOffer.rewardLabel}</div>
                <p className={`text-sm mt-1 ${mutedText}`}>{adOffer.description}</p>
                <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-500/12 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Gem className="h-3.5 w-3.5" />
                  <span>Бонус за просмотр: +5 Самоцветов</span>
                </div>
              </div>
              <div className={`rounded-lg border p-3 text-xs font-mono-num ${subSurface}`}>
                {adSecondsLeft > 0
                  ? `Спонсорский ролик закончится через ${adSecondsLeft} сек...`
                  : 'Награда готова к получению!'}
              </div>
              <button
                disabled={adSecondsLeft > 0}
                onClick={onCompleteAd}
                className={`w-full py-3 px-4 rounded-lg font-bold text-sm transition-colors ${
                  adSecondsLeft > 0
                    ? 'bg-current/10 opacity-50 cursor-not-allowed'
                    : 'bg-[#0FA968] text-white hover:bg-[#0C8E57]'
                }`}
              >
                {adSecondsLeft > 0 ? `Подождите (${adSecondsLeft}с)` : 'Получить награду (+5 С)'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
