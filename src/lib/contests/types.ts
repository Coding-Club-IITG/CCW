export type BracketPosition = string;

export type BracketNode = {
  roomId: string;
  roundNumber: number;
  matchIndex: number;
  teams: [string | null, string | null];
  teamNames: [string | null, string | null];
  teamImages?: [string | null, string | null];
  scores: [number, number];
  status: "pending" | "waiting" | "active" | "completed" | "bye";
  winner: string | null;
  bracketPosition: BracketPosition;
};

export type BracketSnapshot = {
  contestId: string;
  currentRound: number;
  totalRounds: number;
  nodes: BracketNode[];
};
