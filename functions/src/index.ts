/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {CollectionReference, FieldPath} from "firebase-admin/firestore";
import {CallableContext} from "firebase-functions/lib/common/providers/https";

const info = "info";
let gameName = "test-game-01";

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
 * Reads the round number stored in the game collection.
 * @param {CollectionReference} gameCollection the game collection to read from
 * @return {Promise<number>} the round number
 */
async function getRound(gameCollection: CollectionReference): Promise<number> {
  const snapshot = await gameCollection.doc(info).get();
  return snapshot.data()?.round;
}

exports.queryTarget = functions.https.onCall((data, context) => {
  return new Promise((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can query their target");
    }

    getTarget(context, resolve, reject);
  });
});

/**
 * Gets the target of the current user and calls resolve.
 * @param {CallableContext} context
 * @param {Object} resolve
 * @param {Object} reject
 * @return {void}
 */
function getTarget(context: CallableContext, resolve: (value: {
    email: string,
    name: string,
    round: number,
    alive: boolean,
    targetEmail: string,
    targetName: string
}) => void, reject: (value: unknown) => void) {
  const firestore = admin.firestore();
  const gameCollection = firestore.collection(gameName);
  getRound(gameCollection).then((round) => {
    const roundDoc = gameCollection.doc("round" + round);
    roundDoc.get().then((snapshot) => {
      const email = context.auth?.token.email;
      if (email === undefined) {
        throw new functions.https.HttpsError("unauthenticated", "only authenticated users can query their target");
      }
      const game = snapshot.data()?.game;
      const player = game[email];
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

      resolve({
        email: email,
        name: player.name,
        round: round,
        alive: player.alive,
        targetEmail: targetEmail,
        targetName: target.name,
      });
    }).catch((error) => {
      functions.logger.log(error);
      reject(error);
    });
  });
}

exports.eliminateTarget = functions.https.onCall((data, context) => {
  return new Promise((resolve, reject) => {
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
function eliminateTarget(context: CallableContext, resolve: (value: {
    email: string,
    name: string,
    round: number,
    alive: boolean,
    targetEmail: string,
    targetName: string
}) => void, reject: (value: unknown) => void) {
  getTarget(context, (result: { targetEmail: string }) => {
    const firestore = admin.firestore();
    const gameCollection = firestore.collection(gameName);
    getRound(gameCollection).then((round) => {
      const roundDoc = gameCollection.doc("round" + round);
      roundDoc.update(new FieldPath("game", result.targetEmail, "alive"), false).then(() => {
        getTarget(context, resolve, reject);
      });
    });
  }, reject);
}

exports.newRound = functions.https.onCall((data, context) => {
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
  const gameCollection = firestore.collection(gameName);
  getRound(gameCollection).then((round) => {
    const roundDoc = gameCollection.doc("round" + round);
    roundDoc.get().then(async (snapshot) => {
      const emails: string[] = snapshot.data()?.emails;
      const newEmails: string[] = [];
      for (const email of emails) {
        if (snapshot.data()?.game[email].alive) {
          newEmails.push(email);
        }
      }
      const newRoundNumberWrite = gameCollection.doc(info).update({round: round + 1});
      const newRoundWrite = createNewRound(round + 1, newEmails, snapshot.data()?.game);
      await newRoundNumberWrite;
      await newRoundWrite;
      resolve();
    });
  });
}

exports.newGame = functions.https.onCall((data: { [key: string]: { name: string } }, context) => {
  return new Promise<void>((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can eliminate their target");
    }

    admin.auth().getUser(context.auth?.uid).then((user) => {
      if (!user.customClaims?.admin) {
        throw new functions.https.HttpsError("permission-denied", "only admins can start a new round");
      }

      newGame(data, resolve);
    }).catch((error) => {
      functions.logger.log(error);
      reject(error);
    });
  });
});

/**
 * Creates a new game with the given emails and names. Updates {@link gameName} and sets round to 1.
 * @param {Object.<string, {name: string}>} emailsAndNames the emails and names of the players
 * @param {function(void):void} resolve the function to call to resolve the promise
 */
async function newGame(emailsAndNames: { [key: string]: { name: string } }, resolve: () => void) {
  const emails: string[] = [];
  const names: { [key: string]: { name: string } } = {};
  for (const [email, name] of Object.entries(emailsAndNames)) {
    emails.push(email);
    names[email] = name;
  }
  gameName = "game" + Date.now();
  admin.firestore().collection(gameName).doc(info).update({round: 1});
  await createNewRound(1, emails, names);
  resolve();
}

/**
 * Creates a new round with the given emails and names with {@link gameName} and the given round number.
 * @param {number} round the round number
 * @param {string[]} emails the emails of the players
 * @param {Object.<string, {name: string}>} names the names of the players
 */
async function createNewRound(round: number, emails: string[], names: { [key: string]: { name: string } }) {
  const firestore = admin.firestore();
  const gameCollection = firestore.collection(gameName);
  const roundDoc = gameCollection.doc("round" + round);
  shuffleArray(emails);
  const game: { [key: string]: { alive: boolean, name: string, targetEmail: string } } = {};
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const targetEmail = emails[(i + 1) % emails.length];
    game[email] = {alive: true, name: names[email].name, targetEmail: targetEmail};
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
