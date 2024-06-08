export type PlayerWithoutTarget = {
  alive: boolean,
  name: string,
  wasAlive: boolean
}

export type PlayerWithTarget = PlayerWithoutTarget & {
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
