import assert from "node:assert/strict";
import test from "node:test";

import {
  assignPositions,
  averageTeamRating,
  balanceGroup,
  calculateEloDelta,
  matchFormat,
  playerProfile,
  positionalElo,
  preferredSide,
  splitTournamentGroups,
  tournamentGroupSizes,
  winRate,
} from "../lib/foosball-algorithms.ts";

const player = (id, attack = 1000, defense = 1000) => ({
  id,
  attack_elo: attack,
  defense_elo: defense,
});

test("position Elo uses the attack or defense rating", () => {
  const alice = player("alice", 1175, 940);
  assert.equal(positionalElo(alice, "attaquant"), 1175);
  assert.equal(positionalElo(alice, "defenseur"), 940);
});

test("team rating averages Elo for the positions actually played", () => {
  const players = [player("a", 1200, 800), player("b", 900, 1100)];
  assert.equal(averageTeamRating(players, [
    { id: "a", position: "attaquant" },
    { id: "b", position: "defenseur" },
  ]), 1150);
});

test("an empty team is rejected", () => {
  assert.throws(() => averageTeamRating([], []), /at least one player/);
});

test("a match between equal ratings is worth 16 points", () => {
  assert.equal(calculateEloDelta(1000, 1000, true), 16);
  assert.equal(calculateEloDelta(1000, 1000, false), 16);
});

test("an upset awards more points than a favorite's win", () => {
  const favoriteWins = calculateEloDelta(1300, 900, true);
  const outsiderWins = calculateEloDelta(1300, 900, false);
  assert.ok(outsiderWins > favoriteWins);
  assert.ok(favoriteWins >= 1);
});

test("a solo player is assigned to their strongest position", () => {
  assert.deepEqual(assignPositions([player("a", 1080, 1250)]), [
    { id: "a", position: "defenseur" },
  ]);
});

test("a pair gets the attack/defense assignment with the best total", () => {
  const result = assignPositions([
    player("attaquant", 1300, 850),
    player("defenseur", 900, 1275),
  ]);
  assert.deepEqual(result, [
    { id: "attaquant", position: "attaquant" },
    { id: "defenseur", position: "defenseur" },
  ]);
});

test("the generator supports 1v1, 2v1, and 2v2 without duplicates", () => {
  for (const count of [2, 3, 4]) {
    const group = Array.from({ length: count }, (_, index) => player(`p${index}`, 900 + index * 80, 1200 - index * 35));
    const draw = balanceGroup(group, () => 0);
    const members = [...draw.red, ...draw.blue];
    assert.equal(members.length, count);
    assert.equal(new Set(members.map(({ id }) => id)).size, count);
    assert.deepEqual([draw.red.length, draw.blue.length].sort(), count === 2 ? [1, 1] : count === 3 ? [1, 2] : [2, 2]);
  }
});

test("the generator chooses the split with the smallest Elo gap", () => {
  const group = [
    player("a", 1300, 900),
    player("b", 900, 1300),
    player("c", 1200, 800),
    player("d", 800, 1200),
  ];
  const draw = balanceGroup(group, () => 0);
  assert.equal(draw.gap, 0);
  assert.equal(averageTeamRating(group, draw.red), averageTeamRating(group, draw.blue));
});

test("the generator rejects fewer than 2 or more than 4 players", () => {
  assert.throws(() => balanceGroup([player("a")]), /between two and four/);
  assert.throws(() => balanceGroup([1, 2, 3, 4, 5].map((id) => player(String(id)))), /between two and four/);
});

test("tournament grouping lets everyone play in groups of 2 to 4", () => {
  for (let count = 2; count <= 40; count++) {
    const sizes = tournamentGroupSizes(count);
    assert.equal(sizes.reduce((sum, size) => sum + size, 0), count);
    assert.ok(sizes.every((size) => size >= 2 && size <= 4));
  }
  assert.deepEqual(tournamentGroupSizes(5), [3, 2]);
  assert.deepEqual(tournamentGroupSizes(9), [4, 3, 2]);
});

test("tournament grouping keeps every participant exactly once", () => {
  const participants = Array.from({ length: 17 }, (_, index) => ({ id: `p${index}` }));
  const groups = splitTournamentGroups(participants, () => 0.42);
  const ids = groups.flat().map(({ id }) => id);
  assert.equal(ids.length, participants.length);
  assert.equal(new Set(ids).size, participants.length);
  assert.deepEqual([...ids].sort(), participants.map(({ id }) => id).sort());
});

test("match formats are normalized regardless of side", () => {
  assert.equal(matchFormat(1, 1), "1v1");
  assert.equal(matchFormat(1, 2), "2v1");
  assert.equal(matchFormat(2, 1), "2v1");
  assert.equal(matchFormat(2, 2), "2v2");
});

test("player profile uses the 80 Elo specialization threshold", () => {
  assert.equal(playerProfile(player("a", 1079, 1000)), "All-rounder");
  assert.equal(playerProfile(player("b", 1080, 1000)), "Attacker");
  assert.equal(playerProfile(player("c", 1000, 1080)), "Defender");
});

test("win rates are rounded and safe without matches", () => {
  assert.equal(winRate(2, 3), 67);
  assert.equal(winRate(0, 0), 0);
});

test("preferred side distinguishes red, blue, balanced, and no data", () => {
  assert.equal(preferredSide(0, 0, 0, 0), "Untested");
  assert.equal(preferredSide(10, 6, 10, 5), "Red");
  assert.equal(preferredSide(10, 4, 10, 6), "Blue");
  assert.equal(preferredSide(10, 5, 10, 5), "Balanced");
});
