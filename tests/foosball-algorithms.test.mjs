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

test("l'Elo de poste utilise bien la note attaque ou défense", () => {
  const alice = player("alice", 1175, 940);
  assert.equal(positionalElo(alice, "attaquant"), 1175);
  assert.equal(positionalElo(alice, "defenseur"), 940);
});

test("la note d'équipe est la moyenne des Elo aux postes réellement joués", () => {
  const players = [player("a", 1200, 800), player("b", 900, 1100)];
  assert.equal(averageTeamRating(players, [
    { id: "a", position: "attaquant" },
    { id: "b", position: "defenseur" },
  ]), 1150);
});

test("une équipe vide est refusée", () => {
  assert.throws(() => averageTeamRating([], []), /au moins un joueur/);
});

test("un match entre Elo égaux vaut 16 points pour chaque vainqueur", () => {
  assert.equal(calculateEloDelta(1000, 1000, true), 16);
  assert.equal(calculateEloDelta(1000, 1000, false), 16);
});

test("une surprise rapporte plus qu'une victoire du favori", () => {
  const favoriteWins = calculateEloDelta(1300, 900, true);
  const outsiderWins = calculateEloDelta(1300, 900, false);
  assert.ok(outsiderWins > favoriteWins);
  assert.ok(favoriteWins >= 1);
});

test("un joueur seul est placé à son meilleur poste", () => {
  assert.deepEqual(assignPositions([player("a", 1080, 1250)]), [
    { id: "a", position: "defenseur" },
  ]);
});

test("un duo reçoit l'affectation attaque/défense au meilleur total", () => {
  const result = assignPositions([
    player("attaquant", 1300, 850),
    player("defenseur", 900, 1275),
  ]);
  assert.deepEqual(result, [
    { id: "attaquant", position: "attaquant" },
    { id: "defenseur", position: "defenseur" },
  ]);
});

test("le générateur couvre les formats 1v1, 2v1 et 2v2 sans doublon", () => {
  for (const count of [2, 3, 4]) {
    const group = Array.from({ length: count }, (_, index) => player(`p${index}`, 900 + index * 80, 1200 - index * 35));
    const draw = balanceGroup(group, () => 0);
    const members = [...draw.red, ...draw.blue];
    assert.equal(members.length, count);
    assert.equal(new Set(members.map(({ id }) => id)).size, count);
    assert.deepEqual([draw.red.length, draw.blue.length].sort(), count === 2 ? [1, 1] : count === 3 ? [1, 2] : [2, 2]);
  }
});

test("le générateur choisit la partition avec le plus faible écart Elo", () => {
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

test("le générateur refuse moins de 2 ou plus de 4 joueurs", () => {
  assert.throws(() => balanceGroup([player("a")]), /entre deux et quatre/);
  assert.throws(() => balanceGroup([1, 2, 3, 4, 5].map((id) => player(String(id)))), /entre deux et quatre/);
});

test("le découpage de tournoi fait jouer tout le monde par groupes de 2 à 4", () => {
  for (let count = 2; count <= 40; count++) {
    const sizes = tournamentGroupSizes(count);
    assert.equal(sizes.reduce((sum, size) => sum + size, 0), count);
    assert.ok(sizes.every((size) => size >= 2 && size <= 4));
  }
  assert.deepEqual(tournamentGroupSizes(5), [3, 2]);
  assert.deepEqual(tournamentGroupSizes(9), [4, 3, 2]);
});

test("la répartition de tournoi conserve chaque participant exactement une fois", () => {
  const participants = Array.from({ length: 17 }, (_, index) => ({ id: `p${index}` }));
  const groups = splitTournamentGroups(participants, () => 0.42);
  const ids = groups.flat().map(({ id }) => id);
  assert.equal(ids.length, participants.length);
  assert.equal(new Set(ids).size, participants.length);
  assert.deepEqual([...ids].sort(), participants.map(({ id }) => id).sort());
});

test("les formats de match sont normalisés quel que soit le côté", () => {
  assert.equal(matchFormat(1, 1), "1v1");
  assert.equal(matchFormat(1, 2), "2v1");
  assert.equal(matchFormat(2, 1), "2v1");
  assert.equal(matchFormat(2, 2), "2v2");
});

test("le profil joueur respecte le seuil de spécialisation de 80 Elo", () => {
  assert.equal(playerProfile(player("a", 1079, 1000)), "Polyvalent");
  assert.equal(playerProfile(player("b", 1080, 1000)), "Attaquant");
  assert.equal(playerProfile(player("c", 1000, 1080)), "Défenseur");
});

test("les taux de victoire sont arrondis et sûrs sans match", () => {
  assert.equal(winRate(2, 3), 67);
  assert.equal(winRate(0, 0), 0);
});

test("le meilleur côté distingue rouge, bleu, équilibre et absence de données", () => {
  assert.equal(preferredSide(0, 0, 0, 0), "À tester");
  assert.equal(preferredSide(10, 6, 10, 5), "Rouge");
  assert.equal(preferredSide(10, 4, 10, 6), "Bleu");
  assert.equal(preferredSide(10, 5, 10, 5), "Équilibré");
});
