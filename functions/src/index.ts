/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const game = "test-game-01";

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

exports.queryTarget = functions.https.onCall((data, context) => {
  return new Promise((resolve, reject) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "only authenticated users can query their target");
    }

    const firestore = admin.firestore();
    const gamesCollection = firestore.collection("games");
    const gameDoc = gamesCollection.doc(game);
    return gameDoc.get().then((snapshot) => {
      const email = context.auth?.token.email;
      if (email === undefined) {
        throw new functions.https.HttpsError("unauthenticated", "only authenticated users can query their target");
      }
      const players = snapshot.data()?.players;
      const player = players[email];
      let target = players[player.targetEmail];
      let targetEmail = player.targetEmail;
      // Loop until the target is alive
      while (!target.alive) {
        // Break the loop if the target is the player
        targetEmail = target.targetEmail;
        target = players[targetEmail];
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
      resolve(null);
    });
  });
});
