export type BoardThemeId = 'ps2_silver' | 'shibuya_cream' | 'midnight_indigo';

export interface CatTier {
  level: number;
  name: string;
  title: string;
  bodyColor: string;
  bellyColor: string;
  accentColor: string;
  earInnerColor: string;
  eyeColor: string;
  incomePerSec: number;
  buyBaseCost: number;
  accessory:
    | 'none'
    | 'collar'
    | 'scarf'
    | 'ruff'
    | 'kabuto'
    | 'visor'
    | 'astro'
    | 'maneki'
    | 'crown'
    | 'spirit'
    | 'crystal'
    | 'deity';
  scale: number;
}

export type SlotItemKind = 'cat' | 'crate';

export interface BoardSlot {
  index: number;
  kind: SlotItemKind;
  level: number;
  id: string;
}

export interface UpgradeState {
  spawnLevel: number;
  incomeMultiplierLevel: number;
  crateSpeedLevel: number;
}

export interface MissionDef {
  id: string;
  title: string;
  target: number;
  rewardGems: number;
  type: 'merges' | 'maxLevel' | 'taps' | 'crates' | 'mice';
}

export interface DailyMissionDef {
  id: string;
  title: string;
  target: number;
  rewardGems: number;
  rewardTickets?: number;
  type: 'merges' | 'crates' | 'taps' | 'asmr' | 'ads';
}

export interface DailyMissionProgress {
  merges: number;
  crates: number;
  taps: number;
  asmr: number;
  ads: number;
}

export interface WheelSector {
  id: string;
  label: string;
  color: string;
  textColor: string;
  kind: 'coins' | 'gems' | 'auto_merge' | 'boost_3x' | 'bonus_cat' | 'jackpot';
  value: number;
}

export interface DailyRewardDef {
  day: number;
  label: string;
  kind: 'coins' | 'gems' | 'auto_merge' | 'bonus_cat';
  amount: number;
}

export type AsmrToyMode = 'soap' | 'pop' | 'off';

export interface GameState {
  coins: number;
  gems: number;
  goldenFish: number; // Permanent prestige multiplier (+50% income per fish)
  spinTickets: number;
  streakDay: number; // 0..6
  lastDailyClaimAt: number; // timestamp ms
  totalMerges: number;
  totalTaps: number;
  totalCratesOpened: number;
  totalMiceCaught: number;
  totalAsmrSlices: number;
  highestUnlockedLevel: number;
  discoveredRewardsClaimed: number[];
  board: (BoardSlot | null)[]; // length 16 (4x4)
  purchasesPerLevel: Record<number, number>;
  upgrades: UpgradeState;
  claimedMissions: string[];
  dailyDateKey: string;
  dailyProgress: DailyMissionProgress;
  dailyClaimedIds: string[];
  dailyChestClaimed: boolean;
  autoMergeCharges: number;
  doubleIncomeUntil: number; // timestamp ms (2x ad boost)
  tripleIncomeUntil: number; // timestamp ms (3x wheel boost)
  fishRainUntil: number; // timestamp ms (Fish & Coin Rain event)
  zoomiesUntil: number; // timestamp ms (Zoomies x2 speed & income event)
  flashSaleUntil: number; // timestamp ms (-30% cat purchase discount event)
  feverProgress: number; // 0..100
  feverUntil: number; // timestamp ms
  themeId: BoardThemeId;
  asmrMode: AsmrToyMode;
  tutorialStep: number; // 0: merge cats, 1: open crate, 2: catch mouse/wheel, 3: done
  ps2Filter: boolean;
  muted: boolean;
  ambientEnabled: boolean;
  vipPackOwned: boolean;
  lastSavedAt: number;
}

export interface FloatingEvent {
  id: string;
  text: string;
  subtext?: string;
  x: number;
  y: number;
  tone: 'coin' | 'gem' | 'merge' | 'fever' | 'quip' | 'mouse';
}

export type ActiveModal =
  | null
  | 'shop'
  | 'catalog'
  | 'missions'
  | 'fortune'
  | 'offline'
  | 'ad';

export interface RewardedAdOffer {
  id: 'double_income' | 'bonus_cat' | 'auto_merge' | 'spin_ticket' | 'crate_frenzy' | 'offline_double';
  title: string;
  description: string;
  rewardLabel: string;
}

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  priceGems: number;
  bgHex: string;
  fogHex: string;
  boardBaseHex: string;
  tileHex: string;
  tileAltHex: string;
  rimHex: string;
  uiDark: boolean;
}
