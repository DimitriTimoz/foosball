export type MatchPosition = "attaquant" | "defenseur";

export type MatchDraftMember = {
  id: string;
  position: MatchPosition;
};

export type MatchDraft = {
  red: MatchDraftMember[];
  blue: MatchDraftMember[];
  redScore: number;
  blueScore: number;
};

type PreviousLineup = {
  red: MatchDraftMember[];
  blue: MatchDraftMember[];
};

export function createRematchDraft(match: PreviousLineup): MatchDraft {
  return {
    red: match.red.map(({ id, position }) => ({ id, position })),
    blue: match.blue.map(({ id, position }) => ({ id, position })),
    redScore: 0,
    blueScore: 0,
  };
}
