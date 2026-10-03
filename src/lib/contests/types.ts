export type BracketPosition = string;

export type BracketType =
  "upper" | "lower" | "grand_final" | "grand_final_reset";

export type BracketNode = {
  roomId: string;
  winnerDestination?: { roomId: string; slot: 0 | 1 };
  loserDestination?: { roomId: string; slot: 0 | 1 };
  roundNumber: number;
  roundName: string;
  matchIndex: number;
  bracketType?: BracketType;
  teams: [string | null, string | null];
  teamNames: [string | null, string | null];
  teamImages?: [string | null, string | null];
  teamIsNull?: [boolean, boolean];
  walkover?: boolean;
  terminationReason?: string;
  scores: [number, number];
  seeds?: [number | null, number | null];
  slotsResolved: [boolean, boolean];
  status: "pending" | "waiting" | "active" | "completed" | "bye";
  winner: string | null;
  bracketPosition: BracketPosition;
};

export type BracketSnapshot = {
  contestId: string;
  bracketType?: "single_elimination" | "double_elimination";
  grandFinalState?:
    "pending" | "awaiting_reset" | "reset_in_progress" | "complete";
  currentRound: number;
  currentRoundName?: string;
  totalRounds: number;
  upperRounds: number;
  lowerRounds: number;
  nodes: BracketNode[];
};
