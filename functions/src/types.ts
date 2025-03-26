export type PlayerWithoutTarget = {
  name: string,
  alive: boolean,
  wasAlive: boolean
}

export type PlayerWithTarget = PlayerWithoutTarget & {
  beingEliminated: number,
  targetEmail: string,
  eliminating: number
}

export type Game = {
  [email: string]: PlayerWithTarget
}

export type Target = {
  email: string,
  targetEmail: string
}

export type QueryTargetResult = Target & {
  round: number,
  started: boolean,
  alive: boolean,
  beingEliminated: number,
  targetName: string,
  eliminating: number,
  stats?: Stats
}

export type Stats = {
  alive: number,
  eliminated: number,
  eliminatedThisRound: number
}

export type PendingElimination = {
  name: string,
  time: number,
  targetEmail: string,
  targetName: string
}

export type PendingEliminations = {
  [email: string]: PendingElimination
}

export type NewRoundResult = {
  emails: string[],
  game: Game
}

export type NewGame = {
  newGameName: string,
  emailsAndNames: { [email: string]: string },
  randomize: boolean
}
