/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {FieldPath} from "firebase-admin/firestore";
import {CallableContext} from "firebase-functions/lib/common/providers/https";

const game = "test-game-01";
const round = 1;

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
 * Gets the target of the current user and calls resolve.
 * @param {CallableContext} context
 * @param {Object} resolve
 * @param {Object} reject
 * @return {void}
 */
function getTarget(context: CallableContext, resolve: (value: {
    email: string,
    name: string,
    alive: boolean,
    targetEmail: string,
    targetName: string
}) => void, reject: (value: unknown) => void) {
  const firestore = admin.firestore();
  const gameCollection = firestore.collection(game);
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
      alive: player.alive,
      targetEmail: targetEmail,
      targetName: target.name,
    });
  }).catch((error) => {
    functions.logger.log(error);
    reject(null);
  });
}

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
    alive: boolean,
    targetEmail: string,
    targetName: string
}) => void, reject: (value: unknown) => void) {
  getTarget(context, (result: { targetEmail: string }) => {
    const firestore = admin.firestore();
    const gameCollection = firestore.collection(game);
    const roundDoc = gameCollection.doc("round" + round);
    roundDoc.update(new FieldPath("game", result.targetEmail, "alive"), false).then(() => {
      getTarget(context, resolve, reject);
    });
  }, reject);
}

exports.queryTarget = functions.https.onCall((data, context) => {
  return new Promise((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can query their target");
    }

    getTarget(context, resolve, reject);
  });
});

exports.eliminateTarget = functions.https.onCall((data, context) => {
  return new Promise((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can eliminate their target");
    }

    eliminateTarget(context, resolve, reject);
  });
});
