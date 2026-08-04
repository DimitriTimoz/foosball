export type Position = "attaquant" | "defenseur";
export type RatedMember = { id: string; position: Position };
export type RatingPlayer = { id: string; attack_elo: number; defense_elo: number };

export function positionalElo(player: RatingPlayer, position: Position) {
  return position === "attaquant" ? player.attack_elo : player.defense_elo;
}

export function averageTeamRating(players: RatingPlayer[], members: RatedMember[]) {
  if (!members.length) throw new Error("Une équipe doit contenir au moins un joueur.");
  return Math.round(members.reduce((sum, member) => {
    const player = players.find((item) => item.id === member.id);
    return sum + (player ? positionalElo(player, member.position) : 1000);
  }, 0) / members.length);
}

export function calculateEloDelta(redRating: number, blueRating: number, redWon: boolean, kFactor = 32) {
  const expectedRed = 1 / (1 + 10 ** ((blueRating - redRating) / 400));
  return Math.max(1, Math.abs(Math.round(kFactor * ((redWon ? 1 : 0) - expectedRed))));
}

export function assignPositions<T extends RatingPlayer>(players: T[]): RatedMember[] {
  if (players.length < 1 || players.length > 2) throw new Error("Une équipe doit contenir un ou deux joueurs.");
  if (players.length === 1) {
    const player = players[0];
    return [{ id: player.id, position: player.defense_elo > player.attack_elo ? "defenseur" : "attaquant" }];
  }
  const [first, second] = players;
  const firstDefends = first.defense_elo + second.attack_elo >= first.attack_elo + second.defense_elo;
  return [
    { id: first.id, position: firstDefends ? "defenseur" : "attaquant" },
    { id: second.id, position: firstDefends ? "attaquant" : "defenseur" },
  ];
}

export function balanceGroup<T extends RatingPlayer>(group: T[], random: () => number = Math.random) {
  if (group.length < 2 || group.length > 4) throw new Error("Un match doit contenir entre deux et quatre joueurs.");
  const partitions: Array<[T[], T[]]> = [];
  if (group.length === 2) partitions.push([[group[0]], [group[1]]]);
  if (group.length === 3) group.forEach((solo) => partitions.push([group.filter((player) => player.id !== solo.id), [solo]]));
  if (group.length === 4) {
    for (let index = 1; index < group.length; index++) {
      partitions.push([[group[0], group[index]], group.filter((_, itemIndex) => itemIndex !== 0 && itemIndex !== index)]);
    }
  }
  const options = partitions.map(([redPlayers, bluePlayers]) => {
    const red = assignPositions(redPlayers);
    const blue = assignPositions(bluePlayers);
    const exactGap = Math.abs(averageTeamRating(group, red) - averageTeamRating(group, blue));
    return { red, blue, exactGap, score: exactGap + random() * 8 };
  }).sort((first, second) => first.score - second.score);
  const best = options[0];
  return random() > .5
    ? { red: best.blue, blue: best.red, gap: Math.round(best.exactGap) }
    : { red: best.red, blue: best.blue, gap: Math.round(best.exactGap) };
}

export function tournamentGroupSizes(playerCount: number) {
  if (!Number.isInteger(playerCount) || playerCount < 2) throw new Error("Il faut au moins deux participants.");
  const sizes: number[] = [];
  let remaining = playerCount;
  while (remaining > 0) {
    const size = remaining === 5 ? 3 : Math.min(4, remaining);
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
}

export function splitTournamentGroups<T>(players: T[], random: () => number = Math.random) {
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return tournamentGroupSizes(players.length).map((size) => shuffled.splice(0, size));
}

export function matchFormat(redSize: number, blueSize: number) {
  const sizes = [redSize, blueSize].sort((first, second) => second - first);
  return `${sizes[0]}v${sizes[1]}` as "1v1" | "2v1" | "2v2";
}

export function playerProfile(player: Pick<RatingPlayer, "attack_elo" | "defense_elo">) {
  const gap = player.attack_elo - player.defense_elo;
  if (gap >= 80) return "Attaquant";
  if (gap <= -80) return "Défenseur";
  return "Polyvalent";
}

export function winRate(wins: number, games: number) {
  return games > 0 ? Math.round(wins / games * 100) : 0;
}

export function preferredSide(redGames: number, redWins: number, blueGames: number, blueWins: number) {
  if (redGames + blueGames === 0) return "À tester";
  const redRate = winRate(redWins, redGames);
  const blueRate = winRate(blueWins, blueGames);
  if (Math.abs(redRate - blueRate) < 10) return "Équilibré";
  return redRate > blueRate ? "Rouge" : "Bleu";
}
