// Import the functions you need from the SDKs you need
import {initializeApp} from "firebase/app";
import {getAnalytics} from "firebase/analytics";
// Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import {connectFunctionsEmulator, getFunctions, httpsCallable} from "firebase/functions";
import {getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, signOut} from "firebase/auth";
import {doc, getFirestore, onSnapshot, Unsubscribe} from "firebase/firestore";

const activeGameNameCollection = "activeGame"; // The name of the collection that stores the name of the active game
const activeGameName = "name"; // The name of the document that stores the name of the active game
const info = "info"; // The name of the document that stores the round number in the game collection

let gameName = "";
let round = "";
let isInitialGameSnapshot = true;
let unsubActiveGameName: Unsubscribe;
let unsubRound: Unsubscribe;
let unsubGame: Unsubscribe;

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCVjRKS0WeLA_fnynwNi_drATF-e3obPRs",
  authDomain: "gotcha-game.firebaseapp.com",
  projectId: "gotcha-game",
  storageBucket: "gotcha-game.appspot.com",
  messagingSenderId: "256024212174",
  appId: "1:256024212174:web:311f96879a83db86d4d69f",
  measurementId: "G-3BKQPBWZBK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Auth
const provider = new GoogleAuthProvider();
const auth = getAuth();

// Initialize Functions
const functions = getFunctions(app);
// connectFunctionsEmulator(functions, "localhost", 5001);

// Initialize Firestore
const firestore = getFirestore(app);

/**
 * Signs in with Google, updates the UI, and queries the target of the current user.
 */
document.getElementById("signIn").onclick = () => {
  signInWithRedirect(auth, provider);
  document.getElementById("signIn").style.display = "none";
  document.getElementById("signingIn").style.display = "";
}

/**
 * Signs out and updates the UI.
 */
document.getElementById("signOut").onclick = () => {
  if (!confirm("Are you sure you want to sign out?")) {
    return;
  }
  document.getElementById("signOut").style.visibility = "hidden";
  document.getElementById("signingOut").style.display = "";
  if (unsubActiveGameName) {
    unsubActiveGameName();
  }
  if (unsubRound) {
    unsubRound();
  }
  if (unsubGame) {
    unsubGame();
  }
  signOut(auth).then(() => {
    document.getElementById("signingOut").style.display = "none";
  }).catch((error) => {
    console.log("Error signing out: ", error);
  });
}

onAuthStateChanged(auth, user => {
  if (!user) {
    console.log("Auth state changed to null. Most likely the user signed out.");
    document.getElementById("signIn").style.display = "";
    document.getElementById("signingIn").style.display = "none";
    document.getElementById("signOut").style.visibility = "hidden";
    document.getElementById("signingOut").style.display = "none";
    //@ts-ignore
    for (const gameElement of document.getElementsByClassName("game")) {
      gameElement.style.display = "none";
    }
    document.getElementById("eliminate").style.display = "none";
    //@ts-ignore
    for (const gameElement of document.getElementsByClassName("admin")) {
      gameElement.style.display = "none";
    }
    return;
  }
  const name = user.displayName;
  document.getElementById("name").innerHTML += name;
  document.getElementById("signIn").style.display = "none";
  document.getElementById("signingIn").style.display = "none";
  document.getElementById("signOut").style.visibility = "";
  document.getElementById("signingOut").style.display = "none";
  //@ts-ignore
  for (const gameElement of document.getElementsByClassName("game")) {
    gameElement.style.display = "";
  }
  document.getElementById("name").style.display = "";
  document.getElementById("round").style.display = "";
  document.getElementById("alive").style.display = "";
  document.getElementById("target").style.display = "";
  user.getIdTokenResult().then(idTokenResult => {
    if (idTokenResult.claims.admin) {
      // @ts-ignore
      for (const adminElement of document.getElementsByClassName("admin")) {
        if (!adminElement.id.startsWith("creating")) {
          adminElement.style.display = "";
        }
      }
    }
  });
  queryAndHandleTarget();
  if (unsubActiveGameName) {
    unsubActiveGameName();
  }
  unsubActiveGameName = onSnapshot(doc(firestore, activeGameNameCollection, activeGameName), (activeGameNameDoc) => {
    if (activeGameNameDoc.metadata.hasPendingWrites) {
      return;
    }
    gameName = activeGameNameDoc.data()[activeGameName];
    if (unsubRound) {
      unsubRound();
    }
    unsubRound = onSnapshot(doc(firestore, gameName, info), (roundDoc) => {
      if (roundDoc.metadata.hasPendingWrites) {
        return;
      }
      round = roundDoc.data()?.round;
      if (!round) {
        console.log(`Game '${gameName}' info document not found. Report this to the developer.`);
      }
      if (unsubGame) {
        unsubGame();
      }
      unsubGame = onSnapshot(doc(firestore, gameName, "round" + round), (gameDoc) => {
        if (gameDoc.metadata.hasPendingWrites) {
          return;
        }
        if (isInitialGameSnapshot) {
          isInitialGameSnapshot = false;
          return;
        }
        queryAndHandleTarget();
      });
    });
  });
});

/**
 * Eliminates the target of the current user, queries the new target of the current user, and updates the user.
 */
document.getElementById("eliminate").onclick = () => {
  if (!confirm("Are you sure you want to eliminate your target?")) {
    return;
  }
  document.getElementById("eliminate").style.display = "none";
  document.getElementById("eliminating").style.display = "";
  eliminateAndHandleTarget();
}

document.getElementById("newRound").onclick = () => {
  if (!confirm("Are you sure you want to finish this round and start the next round?")) {
    return;
  }
  document.getElementById("newRound").style.display = "none";
  document.getElementById("creatingNewRound").style.display = "";
  const newRound = httpsCallable(functions, "newRound");
  newRound().catch((error) => {
    alert("Error creating new round: " + error)
    console.log(error);
  }).finally(() => {
    document.getElementById("newRound").style.display = "";
    document.getElementById("creatingNewRound").style.display = "none";
  });
}

document.getElementById("newGameForm").onsubmit = () => {
  document.getElementById("newGameForm").style.display = "none";
  document.getElementById("creatingNewGame").style.display = "";
  if (!confirm("Are you sure you want to finish this game and start a new game?")) {
    return onNewGameFailure();
  }

  try {
    // @ts-ignore
    const newGameName: string = document.getElementById("newGameName").value;
    // @ts-ignore
    const emailsAndNamesString: string = document.getElementById("emailsField").value;
    if (!newGameName) {
      alert("Error creating new game: Game name is empty.");
      return onNewGameFailure();
    }
    if (!emailsAndNamesString) {
      alert("Error creating new game: Emails and names are empty.");
      return onNewGameFailure();
    }
    const emailsAndNamesArray = emailsAndNamesString.split("\n");
    if (!confirm(`Creating a new game with ${emailsAndNamesArray.length} players. Confirm the player count is correct.`)) {
      return onNewGameFailure();
    }
    const emailsAndNames: { [email: string]: string } = {};
    for (let line = 0; line < emailsAndNamesArray.length; line++) {
      const emailAndName = emailsAndNamesArray[line];
      if (!emailAndName) {
        alert(`Error creating new game: Line ${line + 1} is empty.`);
        return onNewGameFailure();
      }
      let emailAndNameArray = emailAndName.split("\t");
      if (emailAndNameArray.length > 2) {
        alert(`Error creating new game: Line ${line + 1} has too many tabs. Check that you only pasted the email and name columns and that there are no tabs except between the email and name.`);
        return onNewGameFailure();
      }
      if (emailAndNameArray.length === 1) {
        emailAndNameArray = emailAndName.split(",");
      }
      if (emailAndNameArray.length > 2) {
        alert(`Error creating new game: Line ${line + 1} has too many commas. Check that you only pasted the email and name columns and that there are no commas except between the email and name.`);
        return onNewGameFailure();
      }
      if (emailAndNameArray.length === 1) {
        alert(`Error creating new game: Line ${line + 1} is missing a comma or tab. Check that you pasted the email and name columns and that the email and name are separated by a comma or tab.`);
        return onNewGameFailure();
      }
      const email = emailAndNameArray[0].trim();
      const name = emailAndNameArray[1].trim();
      if (!email) {
        alert(`Error creating new game: Line ${line + 1} email is empty.`);
        return onNewGameFailure();
      }
      if (!name) {
        alert(`Error creating new game: Line ${line + 1} name is empty.`);
        return onNewGameFailure();
      }
      if (!email.includes("@") || !email.includes(".")) {
        alert(`Error creating new game: Line ${line + 1} email is invalid.`);
        return onNewGameFailure();
      }
      if (emailsAndNames[email]) {
        alert(`Error creating new game: Line ${line + 1} email already exists. Check for duplicate emails.`);
        return onNewGameFailure();
      }
      emailsAndNames[email] = name;
    }
    console.log(`Creating new game with name '${newGameName}' and players: `, emailsAndNames);

    httpsCallable(functions, "newGame")({newGameName, emailsAndNames}).catch((error) => {
      alert("Error creating new game: " + error)
      console.log(error);
    }).finally(() => {
      // @ts-ignore
      document.getElementById("newGameName").value = "";
      // @ts-ignore
      document.getElementById("emailsField").value = "";
      document.getElementById("newGameForm").style.display = "";
      document.getElementById("creatingNewGame").style.display = "none";
    });
    return false;
  } catch (error) {
    alert("Error creating new game: " + error);
    console.log(error);
    return onNewGameFailure();
  }
}

/**
 * Queries the target of the current user and updates the UI.
 */
function queryAndHandleTarget() {
  httpsCallable(functions, "queryTarget")().then((result: {
    data: { email: string, round: number, alive: boolean, targetEmail: string, targetName: string }
  }) => {
    if (result === null || result.data === null) {
      console.log("Query target result is null");
      return;
    }
    console.log("Query target result: ", result.data);
    handleTarget(result.data.email, result.data.round, result.data.alive, result.data.targetEmail, result.data.targetName)
  }).catch(error => {
    console.log(error);
  });
}

/**
 * Eliminates the target of the current user, queries the new target of the current user, and updates the UI.
 */
function eliminateAndHandleTarget() {
  httpsCallable(functions, "eliminateTarget")();
}

/**
 * Updates the UI based on the given parameters.
 */
function handleTarget(email: string, round: number, alive: boolean, targetEmail: string, targetName: string) {
  document.getElementById("round").innerHTML = "Round #" + round;
  if (email === targetEmail) {
    document.getElementById("alive").innerHTML = "Congrats!"
    document.getElementById("target").innerHTML = "You are the last player alive.";
  } else {
    document.getElementById("alive").innerHTML = "You are " + (alive ? "alive" : "out");
    if (alive) {
      document.getElementById("target").innerHTML = "Your target is " + targetName;
      document.getElementById("eliminate").style.display = "";
    } else {
      document.getElementById("target").innerHTML = "Thanks for playing!";
    }
  }
  document.getElementById("eliminating").style.display = "none";
}

/**
 * Resets the new game form submit button and hides the creating new game message.
 */
function onNewGameFailure() {
  document.getElementById("newGameForm").style.display = "";
  document.getElementById("creatingNewGame").style.display = "none";
  return false;
}
