/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {CollectionReference, DocumentReference, FieldPath, Firestore} from "firebase-admin/firestore";
import {CallableContext} from "firebase-functions/lib/common/providers/https";

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
    throw new functions.https.HttpsError("not-found", "active game name not found");
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
    throw new functions.https.HttpsError("not-found", `game '${gameName}' info document not found`);
  }
  return {gameName, gameCollection, round};
}

exports.queryTarget = functions.https.onCall((_data, context) => {
  return new Promise((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can query their target");
    }

    const firestore = admin.firestore();
    getRound(firestore).then(({gameName, gameCollection, round}) => {
      const roundDoc = gameCollection.doc("round" + round);
      getTarget(context, gameName, round, roundDoc, resolve, reject, true);
    }).catch((error) => {
      functions.logger.log(error);
      reject(error);
    });
  });
});

/**
 * Gets the target of the current user and calls resolve.
 * @param {CallableContext} context
 * @param {string} gameName the name of the game collection
 * @param {number} round the round number to read from
 * @param {DocumentReference} roundDoc the round document
 * @param {Object} resolve
 * @param {Object} reject
 * @param {boolean} stats whether to include statistics in the result
 * @return {void}
 */
function getTarget(context: CallableContext, gameName: string, round: number, roundDoc: DocumentReference, resolve: (value: {
  email: string,
  round: number,
  alive: boolean,
  targetEmail: string,
  targetName: string,
  stats?: { alive: number, eliminated: number, eliminatedThisRound: number }
}) => void, reject: (value: unknown) => void, stats: boolean): void {
  const email = context.auth?.token.email;
  if (!email) {
    throw new functions.https.HttpsError("unauthenticated", "only authenticated users can query their target");
  }
  roundDoc.get().then((roundDoc) => {
    const game = roundDoc?.data()?.game;
    if (!game) {
      throw new functions.https.HttpsError("not-found", `game '${gameName}' round ${round} game document is empty`);
    }
    const player = game[email];
    if (!player) {
      if (stats) {
        resolve({email: email, round: round, alive: false, targetEmail: "", targetName: "", stats: getStats(game)});
      } else {
        resolve({email: email, round: round, alive: false, targetEmail: "", targetName: ""});
      }
      return;
    }

    let target = game[player.targetEmail];
    let targetEmail = player.targetEmail;
    // Loop until the target is alive
    while (!target.alive) {
      // Break the loop if the target is the player
      targetEmail = target.targetEmail;
      target = game[targetEmail];
      if (targetEmail === email) {
        break;
      }
    }

    if (stats) {
      resolve({
        email: email,
        round: round,
        alive: player.alive,
        targetEmail: targetEmail,
        targetName: target.name,
        stats: getStats(game),
      });
    } else {
      resolve({email: email, round: round, alive: player.alive, targetEmail: targetEmail, targetName: target.name});
    }
  }).catch((error) => {
    functions.logger.log(error);
    reject(error);
  });
}

/**
 * Gets the statistics of the game.
 * @param {Object.<string, {alive: boolean, name: string, targetEmail: string, wasAlive: boolean}>} game the game object
 * @return {{alive: number, eliminated: number, eliminatedThisRound: number}} the statistics
 */
function getStats(game: {
  [email: string]: { alive: boolean, name: string, targetEmail: string, wasAlive: boolean }
}): { alive: number, eliminated: number, eliminatedThisRound: number } {
  const emails = Object.keys(game);
  const alive = emails.filter((email) => game[email].alive).length;
  const eliminated = emails.filter((email) => !game[email].alive).length;
  const eliminatedThisRound = emails.filter((email) => !game[email].alive && game[email].wasAlive).length;
  return {alive, eliminated, eliminatedThisRound};
}

exports.eliminateTarget = functions.https.onCall((_data, context) => {
  return new Promise<void>((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can eliminate their target");
    }

    eliminateTarget(context, resolve, reject);
  });
});

/**
 * Eliminates the target of the current user and calls resolve with the new target.
 * @param {CallableContext} context
 * @param {Object} resolve
 * @param {Object} reject
 * @return {void}
 */
function eliminateTarget(context: CallableContext, resolve: () => void, reject: (value: unknown) => void): void {
  const firestore = admin.firestore();
  getRound(firestore).then(({gameName, gameCollection, round}) => {
    const roundDoc = gameCollection.doc("round" + round);
    getTarget(context, gameName, round, roundDoc, (result: { alive: boolean, targetEmail: string }) => {
      if (!result.alive) {
        throw new functions.https.HttpsError("failed-precondition", "eliminated players cannot eliminate their target");
      }
      roundDoc.update(new FieldPath("game", result.targetEmail, "alive"), false).then(resolve);
    }, reject, false);
  }).catch((error) => {
    functions.logger.log(error);
    reject(error);
  });
}

exports.update = functions.firestore.document("{gameName}/{round}").onUpdate((_change, context) => {
  if (context.params.round !== "update") {
    admin.firestore().doc(`${context.params.gameName}/update`).set({time: Date.now()}).catch((error) => {
      functions.logger.log(error);
    });
  }
});

exports.newRound = functions.https.onCall((_data, context) => {
  return new Promise<void>((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can eliminate their target");
    }

    admin.auth().getUser(context.auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new functions.https.HttpsError("permission-denied", "only admins can start a new round");
      }

      newRound(resolve);
    }).catch((error) => {
      functions.logger.log(error);
      reject(error);
    });
  });
});

/**
 * Creates a new round with the surviving players and increments {@link round}.
 * @param {function(void):void} resolve the function to call to resolve the promise
 */
function newRound(resolve: () => void) {
  const firestore = admin.firestore();
  getRound(firestore).then(({gameName, gameCollection, round}) => {
    const roundDoc = gameCollection.doc("round" + round);
    roundDoc.get().then(async (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        throw new functions.https.HttpsError("not-found", `game '${gameName}' round ${round} game document is empty`);
      }
      const newRoundNumberWrite = gameCollection.doc(info).update({round: round + 1});
      const newRoundWrite = createNewRound(gameCollection, round + 1, data.emails, data.game);
      await newRoundNumberWrite;
      await newRoundWrite;
      resolve();
    });
  });
}

exports.newGame = functions.https.onCall((data: {
  newGameName: string,
  emailsAndNames: { [email: string]: string }
}, context) => {
  return new Promise<void>((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can start a new game");
    }

    admin.auth().getUser(context.auth?.uid).then(async (user) => {
      if (!user.customClaims?.admin) {
        throw new functions.https.HttpsError("permission-denied", "only admins can start a new game");
      }

      await newGame(data);
      resolve();
    }).catch((error) => {
      functions.logger.log(error);
      reject(error);
    });
  });
});

/**
 * Creates a new game with the given emails and names. Updates the active game and sets round to 1.
 * @param {Object.<string, Object>} data the emails and names of the players
 */
async function newGame(data: { newGameName: string, emailsAndNames: { [email: string]: string } }) {
  const emails: string[] = Object.keys(data.emailsAndNames);
  const names: { [email: string]: { name: string, alive: boolean, wasAlive: boolean } } = {};
  for (const email of emails) {
    names[email] = {name: data.emailsAndNames[email], alive: true, wasAlive: true};
  }
  const {newGameName} = data;
  const newActiveGameNameWrite = admin.firestore().collection(activeGameNameCollection).doc(activeGameName).set({name: newGameName});
  const resetRoundNumberWrite = admin.firestore().collection(newGameName).doc(info).set({round: 1});
  const newRoundWrite = createNewRound(admin.firestore().collection(newGameName), 1, emails, names);
  await newActiveGameNameWrite;
  await resetRoundNumberWrite;
  await newRoundWrite;
}

/**
 * Creates a new round with the given emails and names with the active game and the given round number.
 * @param {CollectionReference} gameCollection the game collection
 * @param {number} round the round number
 * @param {string[]} emails the emails of the players
 * @param {Object.<string, {name: string, alive: boolean}>} names the names of the players
 */
async function createNewRound(gameCollection: CollectionReference, round: number, emails: string[], names: {
  [email: string]: { name: string, alive: boolean }
}) {
  const roundDoc = gameCollection.doc("round" + round);
  shuffleArray(emails);
  const game: { [email: string]: { alive: boolean, name: string, targetEmail: string, wasAlive: boolean } } = {};
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const targetEmail = emails[(i + 1) % emails.length];
    game[email] = {
      alive: names[email].alive,
      name: names[email].name,
      targetEmail: targetEmail,
      wasAlive: names[email].alive,
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

exports.makeAdmin = functions.https.onCall((data: string, context) => {
  return new Promise<void>((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can make admins");
    }

    admin.auth().getUser(context.auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new functions.https.HttpsError("permission-denied", "only admins can make admins");
      }

      admin.auth().setCustomUserClaims(data, {admin: true}).then(() => {
        resolve();
      }).catch((error) => {
        functions.logger.log(error);
        reject(error);
      });
    }).catch((error) => {
      functions.logger.log(error);
      reject(error);
    });
  });
});

exports.removeAdmin = functions.https.onCall((data: string, context) => {
  return new Promise<void>((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can remove admins");
    }

    admin.auth().getUser(context.auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new functions.https.HttpsError("permission-denied", "only admins can remove admins");
      }

      if (data === context.auth?.uid) {
        throw new functions.https.HttpsError("invalid-argument", "cannot remove yourself as an admin");
      }

      admin.auth().setCustomUserClaims(data, {admin: false}).then(() => {
        resolve();
      }).catch((error) => {
        functions.logger.log(error);
        reject(error);
      });
    }).catch((error) => {
      functions.logger.log(error);
      reject(error);
    });
  });
});
