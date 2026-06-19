/** UTC interval representing a busy or free block. */
export interface TimeBlock {
  start: string;
  end: string;
}

export interface WorkingHours {
  /** Local time HH:mm */
  start: string;
  /** Local time HH:mm */
  end: string;
  /** ISO weekday numbers: 1=Mon … 7=Sun */
  days: number[];
}

export interface FreeSlot {
  start: string;
  end: string;
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: "09:00",
  end: "17:00",
  days: [1, 2, 3, 4, 5],
};
