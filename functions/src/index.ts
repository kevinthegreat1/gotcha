/* eslint-disable max-len */
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {setGlobalOptions} from "firebase-functions/v2";
import {log} from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {CollectionReference, DocumentReference, FieldPath, Firestore} from "firebase-admin/firestore";
import {Game, NewGame, NewRoundResult, PendingEliminations, PlayerWithoutTarget, PlayerWithTarget, QueryTargetResult, Stats, Target} from "./types";

const activeGameNameCollection = "activeGame"; // The name of the collection that stores the name of the active game
const activeGameName = "name"; // The name of the document that stores the name of the active game
const info = "info"; // The name of the document that stores the round number in the game collection

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCVjRKS0WeLA_fnynwNi_drATF-e3obPRs",
  authDomain: "gotcha-game.firebaseapp.com",
  projectId: "gotcha-game",
  storageBucket: "gotcha-game.appspot.com",
  messagingSenderId: "256024212174",
  appId: "1:256024212174:web:311f96879a83db86d4d69f",
  measurementId: "G-3BKQPBWZBK",
};

// Initialize Firebase
admin.initializeApp(firebaseConfig);
const firestore = admin.firestore();

setGlobalOptions({memory: "256MiB", maxInstances: 1});

/**
 * Gets the active game collection from the game name stored in the active game collection.
 * @param {Firestore} firestore the firestore instance to read from
 */
async function getGameCollection(firestore: Firestore): Promise<{
  gameName: string,
  gameCollection: CollectionReference
}> {
  const gameDoc = await firestore.collection(activeGameNameCollection).doc(activeGameName).get();
  const gameName = gameDoc.data()?.name;
  if (!gameName) {
    throw new HttpsError("not-found", "active game name not found");
  }
  const gameCollection = firestore.collection(gameName);
  return {gameName, gameCollection};
}

/**
 * Reads the round number stored in the game collection based on the game name stored in the active game collection.
 * @param {Firestore} firestore the firestore instance to read from
 * @return {Promise<{ gameName: string, gameCollection: CollectionReference, round: number }>} the game collection and the round number
 */
async function getRound(firestore: Firestore): Promise<{
  gameName: string,
  gameCollection: CollectionReference,
  round: number
}> {
  const {gameName, gameCollection} = await getGameCollection(firestore);
  const round = (await gameCollection.doc(info).get())?.data()?.round;
  if (!round) {
    throw new HttpsError("not-found", `game '${gameName}' info document not found`);
  }
  return {gameName, gameCollection, round};
}

exports.queryTarget = onCall(({auth}) => {
  return new Promise((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can query their target");
    }

    getRound(firestore).then(({gameName, gameCollection, round}) => {
      const roundDoc = gameCollection.doc("round" + round);
      getTarget(gameName, round, roundDoc, auth?.token.email, resolve, reject, true);
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});

/**
 * Gets the target of the current user and calls resolve.
 * @param {string} gameName the name of the game collection
 * @param {number} round the round number to read from
 * @param {DocumentReference} roundDoc the round document
 * @param {string} email the email of the current user
 * @param {function(QueryTargetResult): void} resolve
 * @param {function(unknown): void} reject
 * @param {boolean} stats whether to include statistics in the result
 * @return {void}
 */
function getTarget(gameName: string, round: number, roundDoc: DocumentReference, email: string | undefined, resolve: (value: QueryTargetResult) => void, reject: (value: unknown) => void, stats: boolean): void {
  if (!email) {
    throw new HttpsError("unauthenticated", "only authenticated users can query their target");
  }
  roundDoc.get().then((roundDoc) => {
    const started = roundDoc?.data()?.started;
    const game = roundDoc?.data()?.game;
    if (!game) {
      throw new HttpsError("not-found", `game '${gameName}' round ${round} game document is empty`);
    }
    const player = game[email];
    if (!player) {
      if (stats) {
        resolve({
          email: email,
          round: round,
          started: started,
          alive: false,
          beingEliminated: 0,
          targetEmail: "",
          targetName: "",
          eliminating: 0,
          stats: getStats(game),
        });
      } else {
        resolve({
          email: email,
          round: round,
          started: started,
          alive: false,
          beingEliminated: 0,
          targetEmail: "",
          targetName: "",
          eliminating: 0,
        });
      }
      return;
    }

    const {targetEmail, target} = getTargetInternal(game, email);

    if (stats) {
      resolve({
        email: email,
        round: round,
        started: started,
        alive: player.alive,
        beingEliminated: player.beingEliminated,
        targetEmail: started ? targetEmail : "",
        targetName: started ? target.name : "",
        eliminating: player.eliminating,
        stats: getStats(game),
      });
    } else {
      resolve({
        email: email,
        round: round,
        started: started,
        alive: player.alive,
        beingEliminated: player.beingEliminated,
        targetEmail: started ? targetEmail : "",
        targetName: started ? target.name : "",
        eliminating: player.eliminating,
      });
    }
  }).catch((error) => {
    log(error);
    reject(error);
  });
}

/**
 * Gets the target of the provided email in the provided game.
 * @param {Game} game the game object
 * @param {string} email the email of the player
 * @return {{target: PlayerWithTarget, targetEmail: string}} the target and the target's email
 */
function getTargetInternal(game: Game, email: string): { target: PlayerWithTarget; targetEmail: string; } {
  const player = game[email];
  let targetEmail = player.targetEmail;
  let target = game[targetEmail];
  // Loop until the target is alive
  while (!target.alive) {
    // Break the loop if the target is the player
    targetEmail = target.targetEmail;
    target = game[targetEmail];
    if (targetEmail === email) {
      break;
    }
  }
  return {targetEmail, target};
}

/**
 * Gets the statistics of the game.
 * @param {Game} game the game object
 * @return {Stats} the statistics
 */
function getStats(game: Game): Stats {
  const emails = Object.keys(game);
  const alive = emails.filter((email) => game[email].alive).length;
  const eliminated = emails.filter((email) => !game[email].alive).length;
  const eliminatedThisRound = emails.filter((email) => !game[email].alive && game[email].wasAlive).length;
  return {alive, eliminated, eliminatedThisRound};
}

exports.eliminateTarget = onCall(({auth}) => {
  return new Promise<void>((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can eliminate their target");
    }

    eliminateTarget(auth?.token.email, resolve, reject);
  });
});

/**
 * Marks the current user as eliminating.
 * @param {string} email the email of the current user
 * @param {function(void): void} resolve
 * @param {function(unknown): void} reject
 */
function eliminateTarget(email: string | undefined, resolve: () => void, reject: (value: unknown) => void): void {
  if (!email) {
    throw new HttpsError("unauthenticated", "only authenticated users can query their target");
  }
  getRound(firestore).then(({gameName, gameCollection, round}) => {
    const roundDoc = gameCollection.doc("round" + round);
    roundDoc.get().then((roundDocSnapshot) => {
      const game: Game = roundDocSnapshot?.data()?.game;
      if (!game) {
        throw new HttpsError("not-found", `game '${gameName}' round ${round} game document is empty`);
      }
      const player = game[email];
      if (!player) {
        resolve();
        return;
      }
      if (!player.alive) {
        throw new HttpsError("failed-precondition", "eliminated players cannot eliminate their target");
      }

      log(`Player ${email} wants to eliminate their target`);
      roundDoc.update(new FieldPath("game", email, "eliminating"), Date.now(), new FieldPath("game", player.targetEmail, "beingEliminated"), Date.now()).then(resolve);
    });
  }).catch((error) => {
    log(error);
    reject(error);
  });
}

exports.getPendingEliminations = onCall(({auth}) => {
  return new Promise((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can get pending eliminations");
    }

    admin.auth().getUser(auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new HttpsError("permission-denied", "only admins can get pending eliminations");
      }

      getPendingEliminations(resolve, reject);
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});

/**
 * Gets the pending eliminations.
 * @param {function(PendingEliminations): void} resolve
 * @param {function(unknown): void} reject
 */
function getPendingEliminations(resolve: (value: PendingEliminations) => void, reject: (value: unknown) => void): void {
  getRound(firestore).then(({gameName, gameCollection, round}) => {
    const roundDoc = gameCollection.doc("round" + round);
    roundDoc.get().then((roundDocSnapshot) => {
      const game: Game = roundDocSnapshot?.data()?.game;
      if (!game) {
        throw new HttpsError("not-found", `game '${gameName}' round ${round} game document is empty`);
      }
      const emails = Object.keys(game);
      emails.sort((a, b) => game[a].eliminating - game[b].eliminating);
      const pendingEliminations: PendingEliminations = {};
      for (const email of emails) {
        const player = game[email];
        if (player.alive && player.eliminating) {
          const {targetEmail, target} = getTargetInternal(game, email);
          pendingEliminations[email] = {
            name: player.name,
            time: player.eliminating,
            targetEmail: targetEmail,
            targetName: target.name,
          };
        }
      }
      resolve(pendingEliminations);
    });
  }).catch((error) => {
    log(error);
    reject(error);
  });
}

exports.confirmEliminateTarget = onCall<Target>(({data, auth}) => {
  return new Promise<void>((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can confirm eliminations");
    }

    admin.auth().getUser(auth?.uid).then(async (user) => {
      if (!user.customClaims?.admin) {
        throw new HttpsError("permission-denied", "only admins can confirm eliminations");
      }

      confirmEliminateTarget(auth?.token.email ?? "", data.email, data.targetEmail, resolve, reject);
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});

/**
 * Confirms the elimination the target of the current user.
 * @param {string} adminEmail the email of the admin confirming the elimination
 * @param {string} email the email of the user to confirm the elimination for
 * @param {string} targetEmail the email of the target to eliminate
 * @param {Object} resolve
 * @param {Object} reject
 * @return {void}
 */
function confirmEliminateTarget(adminEmail: string, email: string, targetEmail: string, resolve: () => void, reject: (value: unknown) => void): void {
  getRound(firestore).then(({gameName, gameCollection, round}) => {
    const roundDoc = gameCollection.doc("round" + round);
    getTarget(gameName, round, roundDoc, email, async (result: QueryTargetResult) => {
      if (!result.alive) {
        throw new HttpsError("failed-precondition", `confirmation failed for admin ${adminEmail}: player ${email} is eliminated and cannot eliminate their target ${targetEmail}`);
      }
      if (!result.eliminating) {
        throw new HttpsError("failed-precondition", `confirmation failed for admin ${adminEmail}: player ${email} is not eliminating their target ${targetEmail}, most likely the elimination has been canceled by another admin`);
      }
      if (result.targetEmail !== targetEmail) {
        throw new HttpsError("failed-precondition", `confirmation failed for admin ${adminEmail}: player ${email}'s current target ${targetEmail} does not match the requested elimination target ${result.targetEmail}, most likely the elimination has been confirmed by another admin`);
      }
      log(`Admin ${adminEmail} confirmed player ${email} eliminating their target ${targetEmail}`);
      roundDoc.update(new FieldPath("game", email, "eliminating"), 0, new FieldPath("game", targetEmail, "beingEliminated"), 0, new FieldPath("game", result.targetEmail, "alive"), false).then(resolve);
    }, reject, false);
  }).catch((error) => {
    log(error);
    reject(error);
  });
}

exports.cancelEliminateTarget = onCall<{ email: string }>(({data, auth}) => {
  return new Promise<void>((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can cancel eliminations");
    }

    admin.auth().getUser(auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new HttpsError("permission-denied", "only admins can cancel eliminations");
      }

      cancelEliminateTarget(auth?.token.email ?? "", data.email, resolve, reject);
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});

/**
 * Cancels the elimination of the target of the current user.
 * @param {string} adminEmail the email of the admin canceling the elimination
 * @param {string} email the email of the user to cancel the elimination for
 * @param {function(void): void} resolve
 * @param {function(unknown): void} reject
 * @return {void}
 */
function cancelEliminateTarget(adminEmail: string, email: string, resolve: () => void, reject: (value: unknown) => void): void {
  getRound(firestore).then(({gameName, gameCollection, round}) => {
    const roundDoc = gameCollection.doc("round" + round);
    getTarget(gameName, round, roundDoc, email, async (result: QueryTargetResult) => {
      log(`Admin ${adminEmail} canceled player ${email} eliminating their target`);
      roundDoc.update(new FieldPath("game", email, "eliminating"), 0, new FieldPath("game", result.targetEmail, "beingEliminated"), 0).then(resolve);
    }, reject, false);
  }).catch((error) => {
    log(error);
    reject(error);
  });
}

exports.update = onDocumentUpdated("{gameName}/{round}", ({params}) => {
  if (params.round !== "update") {
    firestore.doc(`${params.gameName}/update`).set({time: Date.now()}).catch((error) => {
      log(error);
    });
  }
  return null;
});

exports.startRound = onCall(({auth}) => {
  return new Promise<void>((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can start a round");
    }

    admin.auth().getUser(auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new HttpsError("permission-denied", "only admins can start a round");
      }

      getRound(firestore).then(async ({gameName, gameCollection, round}) => {
        const roundDoc = gameCollection.doc("round" + round);
        await roundDoc.update({started: true});
        log(`Admin ${auth?.token.email} started game '${gameName}' round ${round}`);
        resolve();
      });
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});

exports.newRound = onCall<{ randomize: boolean }>(({data, auth}) => {
  return new Promise((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can eliminate their target");
    }

    admin.auth().getUser(auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new HttpsError("permission-denied", "only admins can start a new round");
      }

      newRound(resolve, data.randomize);
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});

/**
 * Creates a new round with the surviving players and increments {@link round}.
 * @param {function(NewRoundResult): void} resolve the function to call to resolve the promise
 * @param {boolean} randomize whether to randomize the order of the players
 */
function newRound(resolve: (value: NewRoundResult) => void, randomize: boolean) {
  getRound(firestore).then(({gameName, gameCollection, round}) => {
    const roundDoc = gameCollection.doc("round" + round);
    roundDoc.get().then(async (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        throw new HttpsError("not-found", `game '${gameName}' round ${round} game document is empty`);
      }
      const newRoundNumberWrite = gameCollection.doc(info).update({round: round + 1});
      const newRoundWrite = createNewRound(gameCollection, round + 1, [...data.emails], data.game, randomize);
      await newRoundNumberWrite;
      await newRoundWrite;
      resolve({emails: data.emails, game: data.game});
    });
  });
}

exports.newGame = onCall<NewGame>(({data, auth}) => {
  return new Promise<void>((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can start a new game");
    }

    admin.auth().getUser(auth?.uid).then(async (user) => {
      if (!user.customClaims?.admin) {
        throw new HttpsError("permission-denied", "only admins can start a new game");
      }

      await newGame(data);
      resolve();
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});

/**
 * Creates a new game with the given emails and names. Updates the active game and sets round to 1.
 * @param {Object.<string, Object>} data the emails and names of the players
 */
async function newGame(data: NewGame) {
  const emails: string[] = Object.keys(data.emailsAndNames);
  const names: { [email: string]: PlayerWithoutTarget } = {};
  for (const email of emails) {
    names[email] = {name: data.emailsAndNames[email], alive: true, wasAlive: true};
  }
  const {newGameName, randomize} = data;
  const newActiveGameNameWrite = firestore.collection(activeGameNameCollection).doc(activeGameName).set({name: newGameName});
  const resetRoundNumberWrite = firestore.collection(newGameName).doc(info).set({round: 1});
  const newRoundWrite = createNewRound(firestore.collection(newGameName), 1, emails, names, randomize);
  await newActiveGameNameWrite;
  await resetRoundNumberWrite;
  await newRoundWrite;
}

/**
 * Creates a new round with the given emails and names with the active game and the given round number.
 * @param {CollectionReference} gameCollection the game collection
 * @param {number} round the round number
 * @param {string[]} emails the emails of the players
 * @param {Object.<string, PlayerWithoutTarget>} names the names of the players
 * @param {boolean} randomize whether to randomize the order of the players
 */
async function createNewRound(gameCollection: CollectionReference, round: number, emails: string[], names: {
  [email: string]: PlayerWithoutTarget
}, randomize: boolean) {
  const roundDoc = gameCollection.doc("round" + round);
  if (randomize) {
    shuffleArray(emails);
  }
  const game: Game = {};
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const targetEmail = emails[(i + 1) % emails.length];
    game[email] = {
      name: names[email].name,
      alive: names[email].alive,
      wasAlive: names[email].alive,
      beingEliminated: 0,
      targetEmail: targetEmail,
      eliminating: 0,
    };
  }
  await roundDoc.set({emails: emails, game: game});
}

/**
 * Shuffles array in place using the Durstenfeld shuffle algorithm.
 * @param {[]} array the array to shuffle.
 */
function shuffleArray(array: unknown[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

exports.makeAdmin = onCall<string>(({data, auth}) => {
  return new Promise<void>((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can make admins");
    }

    admin.auth().getUser(auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new HttpsError("permission-denied", "only admins can make admins");
      }

      admin.auth().setCustomUserClaims(data, {admin: true}).then(() => {
        resolve();
      }).catch((error) => {
        log(error);
        reject(error);
      });
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});

exports.removeAdmin = onCall<string>(({data, auth}) => {
  return new Promise<void>((resolve, reject) => {
    if (!auth) {
      throw new HttpsError("unauthenticated", "only authenticated users can remove admins");
    }

    admin.auth().getUser(auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new HttpsError("permission-denied", "only admins can remove admins");
      }

      if (data === auth?.uid) {
        throw new HttpsError("invalid-argument", "cannot remove yourself as an admin");
      }

      admin.auth().setCustomUserClaims(data, {admin: false}).then(() => {
        resolve();
      }).catch((error) => {
        log(error);
        reject(error);
      });
    }).catch((error) => {
      log(error);
      reject(error);
    });
  });
});
