export type ISODate = string;

export type Slot = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'dessert';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'snack', 'dinner', 'dessert'];

export type Pool = 'breakfast' | 'main' | 'snack' | 'dessert';
export type Mode = 'weekday' | 'weekend' | 'any';
export type DayMode = 'weekday' | 'weekend';
export type WeekType = 'standard' | 'deload' | 'maintenance' | 'checkpoint';

export function slotPool(slot: Slot): Pool {
  if (slot === 'lunch' || slot === 'dinner') return 'main';
  return slot;
}
