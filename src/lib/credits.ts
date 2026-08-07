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

export const CREDIT_LIMITS = {
  sections: 30,
  entriesPerSection: 50,
  headingLength: 80,
  periodLength: 80,
} as const;
