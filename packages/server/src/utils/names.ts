/**
 * Bot name generator for realistic player names
 */

export const BOT_NAMES = [
  "ProGamer99", "Alex", "Guest_402", "PaperKing", "NoScope",
  "Shadow", "Winner", "SnakeEater", "BigBoss", "ChillDude",
  "Area51", "HexMaster", "Speedy", "Drift", "Ghost",
  "PlayerOne", "Mighty", "Zen", "Killer", "Blob",
  "Storm", "Ninja", "Ace", "Viper", "Phoenix",
  "Legend", "Shark", "Tiger", "Dragon", "Wolf",
  "Master", "Captain", "Chief", "Boss", "King",
  "Hunter", "Ranger", "Scout", "Sniper", "Tank",
  "Flash", "Sonic", "Turbo", "Rocket", "Blitz",
  "Neo", "Matrix", "Cyber", "Digital", "Pixel",
  "Gamer", "Player", "Noob", "Pro", "Elite"
];

export function getRandomBotName(): string {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}
