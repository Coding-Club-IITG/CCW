export interface CreditEntryInput {
  userId: string;
  period: string;
}

export interface CreditSectionInput {
  heading: string;
  entries: CreditEntryInput[];
}

export interface CreditEntry extends CreditEntryInput {
  name: string;
  image: string | null;
}

export interface CreditSection {
  heading: string;
  entries: CreditEntry[];
}

export function shuffleCreditEntries<T>(entries: readonly T[]): T[] {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export const CREDIT_LIMITS = {
  sections: 30,
  entriesPerSection: 50,
  headingLength: 80,
  periodLength: 80,
} as const;
