import {
  BoardTheme,
  CatTier,
  DailyMissionDef,
  DailyRewardDef,
  MissionDef,
  WheelSector,
} from './types';

export const BOARD_SIZE = 16; // 4x4 grid

export const CAT_TIERS: CatTier[] = [
  {
    level: 1,
    name: 'Котёнок Моти',
    title: 'Мягкий старт',
    bodyColor: '#FFFDF7',
    bellyColor: '#FFF0E5',
    accentColor: '#FF7B6B',
    earInnerColor: '#FFB3BA',
    eyeColor: '#1E2430',
    incomePerSec: 2,
    buyBaseCost: 25,
    accessory: 'collar',
    scale: 0.78,
  },
  {
    level: 2,
    name: 'Рыжий Полосатик',
    title: 'Шкодный тигрёнок',
    bodyColor: '#FFA959',
    bellyColor: '#FFF4E0',
    accentColor: '#48A9A6',
    earInnerColor: '#FF9EAA',
    eyeColor: '#1E2430',
    incomePerSec: 6,
    buyBaseCost: 65,
    accessory: 'collar',
    scale: 0.84,
  },
  {
    level: 3,
    name: 'Сиамский Принц',
    title: 'Голубоглазый аристократ',
    bodyColor: '#EFE4D4',
    bellyColor: '#FAF6F0',
    accentColor: '#5B6C8F',
    earInnerColor: '#C8A69E',
    eyeColor: '#2E86DE',
    incomePerSec: 16,
    buyBaseCost: 170,
    accessory: 'scarf',
    scale: 0.88,
  },
  {
    level: 4,
    name: 'Плюшевый Дым',
    title: 'Облачный британец',
    bodyColor: '#9AA8BC',
    bellyColor: '#DFE5EE',
    accentColor: '#FFAA33',
    earInnerColor: '#E8AEB7',
    eyeColor: '#F6A623',
    incomePerSec: 42,
    buyBaseCost: 440,
    accessory: 'ruff',
    scale: 0.94,
  },
  {
    level: 5,
    name: 'Сёгун Мяу',
    title: 'Защитник доски',
    bodyColor: '#3B4252',
    bellyColor: '#ECEFF4',
    accentColor: '#E63946',
    earInnerColor: '#D08770',
    eyeColor: '#FFD166',
    incomePerSec: 110,
    buyBaseCost: 1150,
    accessory: 'kabuto',
    scale: 0.98,
  },
  {
    level: 6,
    name: 'Кибер-Кот 2002',
    title: 'Цифровой неон PS2',
    bodyColor: '#2B3040',
    bellyColor: '#535D78',
    accentColor: '#00D2D3',
    earInnerColor: '#48DBFB',
    eyeColor: '#00F5D4',
    incomePerSec: 280,
    buyBaseCost: 3000,
    accessory: 'visor',
    scale: 1.0,
  },
  {
    level: 7,
    name: 'Космо-Нэко',
    title: 'Орбитальный пилот',
    bodyColor: '#F4F7FC',
    bellyColor: '#DCE4F2',
    accentColor: '#FF6B35',
    earInnerColor: '#FF9F80',
    eyeColor: '#2C3E50',
    incomePerSec: 720,
    buyBaseCost: 7800,
    accessory: 'astro',
    scale: 1.04,
  },
  {
    level: 8,
    name: 'Золотой Манэки',
    title: 'Магнит богатства',
    bodyColor: '#FFD147',
    bellyColor: '#FFF7D6',
    accentColor: '#E63946',
    earInnerColor: '#FFB703',
    eyeColor: '#242933',
    incomePerSec: 1850,
    buyBaseCost: 20500,
    accessory: 'maneki',
    scale: 1.08,
  },
  {
    level: 9,
    name: 'Император Нефрит',
    title: 'Владыка лотоса',
    bodyColor: '#2EC4B6',
    bellyColor: '#CBF3F0',
    accentColor: '#FFB703',
    earInnerColor: '#80ED99',
    eyeColor: '#14213D',
    incomePerSec: 4800,
    buyBaseCost: 54000,
    accessory: 'crown',
    scale: 1.1,
  },
  {
    level: 10,
    name: 'Призрачный Нэко',
    title: 'Двухвостый дух',
    bodyColor: '#D8D4F2',
    bellyColor: '#F5F3FF',
    accentColor: '#8338EC',
    earInnerColor: '#C77DFF',
    eyeColor: '#FF006E',
    incomePerSec: 12500,
    buyBaseCost: 145000,
    accessory: 'spirit',
    scale: 1.12,
  },
  {
    level: 11,
    name: 'Кристальный Титан',
    title: 'Призма из полигонов',
    bodyColor: '#56CFE1',
    bellyColor: '#CAF0F8',
    accentColor: '#3A86FF',
    earInnerColor: '#90E0EF',
    eyeColor: '#FFFFFF',
    incomePerSec: 32000,
    buyBaseCost: 390000,
    accessory: 'crystal',
    scale: 1.15,
  },
  {
    level: 12,
    name: 'Легендарный Котобог',
    title: 'Абсолютная форма',
    bodyColor: '#FFF8E7',
    bellyColor: '#FFFFFF',
    accentColor: '#F7B801',
    earInnerColor: '#FFD166',
    eyeColor: '#FF9F1C',
    incomePerSec: 88000,
    buyBaseCost: 1100000,
    accessory: 'deity',
    scale: 1.2,
  },
];

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'ps2_silver',
    name: 'PS2 Серебро',
    priceGems: 0,
    bgHex: '#E6EAF2',
    fogHex: '#E6EAF2',
    boardBaseHex: '#C8D0DF',
    tileHex: '#F7F9FC',
    tileAltHex: '#ECEFF6',
    rimHex: '#4E7BFF',
    uiDark: false,
  },
  {
    id: 'shibuya_cream',
    name: 'Сибуя Крем',
    priceGems: 40,
    bgHex: '#F3ECE2',
    fogHex: '#F3ECE2',
    boardBaseHex: '#DDD0BF',
    tileHex: '#FFFDF8',
    tileAltHex: '#F5EDE1',
    rimHex: '#FF6B4A',
    uiDark: false,
  },
  {
    id: 'midnight_indigo',
    name: 'Ночной Токио',
    priceGems: 80,
    bgHex: '#151926',
    fogHex: '#151926',
    boardBaseHex: '#22283C',
    tileHex: '#2B334B',
    tileAltHex: '#252C42',
    rimHex: '#00D2D3',
    uiDark: true,
  },
];

export const MISSIONS: MissionDef[] = [
  {
    id: 'merge_5',
    title: 'Первые шаги: сделай 5 слияний',
    target: 5,
    rewardGems: 15,
    type: 'merges',
  },
  {
    id: 'mouse_2',
    title: 'Охотник: поймай 2 Золотых Мышей',
    target: 2,
    rewardGems: 25,
    type: 'mice',
  },
  {
    id: 'merge_25',
    title: 'Мастер слияния: 25 объединений',
    target: 25,
    rewardGems: 35,
    type: 'merges',
  },
  {
    id: 'mouse_8',
    title: 'Гроза грызунов: поймай 8 Мышей',
    target: 8,
    rewardGems: 50,
    type: 'mice',
  },
  {
    id: 'merge_100',
    title: 'Полигональный магнат: 100 слияний',
    target: 100,
    rewardGems: 80,
    type: 'merges',
  },
  {
    id: 'level_5',
    title: 'Открой Сёгуна Мяу (5 уровень)',
    target: 5,
    rewardGems: 30,
    type: 'maxLevel',
  },
  {
    id: 'level_8',
    title: 'Открой Золотого Манэки (8 уровень)',
    target: 8,
    rewardGems: 65,
    type: 'maxLevel',
  },
  {
    id: 'taps_30',
    title: 'Погладь котов 30 раз',
    target: 30,
    rewardGems: 20,
    type: 'taps',
  },
  {
    id: 'crates_10',
    title: 'Распакуй 10 посылок',
    target: 10,
    rewardGems: 25,
    type: 'crates',
  },
];

export const DAILY_MISSIONS: DailyMissionDef[] = [
  {
    id: 'dm_merges',
    title: 'Слей котов 15 раз',
    target: 15,
    rewardGems: 25,
    type: 'merges',
  },
  {
    id: 'dm_crates',
    title: 'Распакуй 8 посылок',
    target: 8,
    rewardGems: 20,
    type: 'crates',
  },
  {
    id: 'dm_taps',
    title: 'Погладь котов 20 раз',
    target: 20,
    rewardGems: 15,
    type: 'taps',
  },
  {
    id: 'dm_asmr',
    title: 'Релакс-тайм: 12 тапов по мылу или поп-иту',
    target: 12,
    rewardGems: 20,
    type: 'asmr',
  },
  {
    id: 'dm_ads',
    title: 'Включи 2 видео-буста для ускорения',
    target: 2,
    rewardGems: 30,
    rewardTickets: 1,
    type: 'ads',
  },
];

export const CAT_QUIPS: string[] = [
  'Мурр! Ещё погладь!',
  'Где моя рыбка?',
  'PS2 полигоны рулят!',
  'Ночной тыгыдык готов!',
  'Слей меня в легенду!',
  'Лови Золотую Мышь!',
  'Я тут главный босс',
  'Кот-инвестор в деле',
  'Лапки приносят кэш',
  'Мяу-лихорадка близко!',
];

export const WHEEL_SECTORS: WheelSector[] = [
  {
    id: 'coins_small',
    label: '+25с дохода',
    color: '#3B66F5',
    textColor: '#FFFFFF',
    kind: 'coins',
    value: 25,
  },
  {
    id: 'gems_15',
    label: '+15 Самоцв.',
    color: '#0FA968',
    textColor: '#FFFFFF',
    kind: 'gems',
    value: 15,
  },
  {
    id: 'boost_3x',
    label: 'x3 Доход 45с',
    color: '#F59E0B',
    textColor: '#171B26',
    kind: 'boost_3x',
    value: 45,
  },
  {
    id: 'auto_merge',
    label: '+2 Авто-слиян.',
    color: '#6366F1',
    textColor: '#FFFFFF',
    kind: 'auto_merge',
    value: 2,
  },
  {
    id: 'bonus_cat',
    label: 'Кот +2 Ур.',
    color: '#EC4899',
    textColor: '#FFFFFF',
    kind: 'bonus_cat',
    value: 2,
  },
  {
    id: 'jackpot',
    label: 'ДЖЕКПОТ +50 С',
    color: '#FFD147',
    textColor: '#171B26',
    kind: 'jackpot',
    value: 50,
  },
];

export const DAILY_REWARDS: DailyRewardDef[] = [
  { day: 1, label: '+250 Монет', kind: 'coins', amount: 250 },
  { day: 2, label: '+20 Самоцв.', kind: 'gems', amount: 20 },
  { day: 3, label: '+2 Авто-слиян.', kind: 'auto_merge', amount: 2 },
  { day: 4, label: '+40 Самоцв.', kind: 'gems', amount: 40 },
  { day: 5, label: 'Кот +2 Ур.', kind: 'bonus_cat', amount: 2 },
  { day: 6, label: '+75 Самоцв.', kind: 'gems', amount: 75 },
  { day: 7, label: '+150 Самоцв.', kind: 'gems', amount: 150 },
];

export function formatCoins(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value < 1000) return Math.floor(value).toString();
  const units = ['K', 'M', 'B', 'T', 'Qa'];
  let v = value;
  let unitIdx = -1;
  while (v >= 1000 && unitIdx < units.length - 1) {
    v /= 1000;
    unitIdx++;
  }
  const formatted = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${formatted.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}${units[unitIdx]}`;
}

export function getCatPurchasePrice(
  level: number,
  timesBought: number,
  flashSaleActive = false,
): number {
  const tier = CAT_TIERS[Math.max(0, Math.min(CAT_TIERS.length - 1, level - 1))];
  const raw = tier.buyBaseCost * Math.pow(1.14, timesBought);
  return Math.max(10, Math.round(flashSaleActive ? raw * 0.7 : raw));
}

export function getUpgradeCost(
  kind: 'spawnLevel' | 'incomeMultiplierLevel' | 'crateSpeedLevel',
  currentLevel: number,
): { currency: 'coins' | 'gems'; amount: number } {
  if (kind === 'spawnLevel') {
    return {
      currency: 'coins',
      amount: Math.round(320 * Math.pow(2.75, currentLevel - 1)),
    };
  }
  if (kind === 'incomeMultiplierLevel') {
    return {
      currency: 'coins',
      amount: Math.round(220 * Math.pow(1.95, currentLevel - 1)),
    };
  }
  return {
    currency: 'gems',
    amount: 15 + (currentLevel - 1) * 12,
  };
}

export function getPendingGoldenFish(highestLevel: number, totalMerges: number): number {
  if (highestLevel < 6) return 0;
  return Math.max(1, (highestLevel - 5) * 2 + Math.floor(totalMerges / 40));
}
