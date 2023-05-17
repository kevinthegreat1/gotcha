// Import the functions you need from the SDKs you need
import {initializeApp} from "firebase/app";
import {getAnalytics} from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import {getFunctions, httpsCallable} from "firebase/functions";
import {getAuth, GoogleAuthProvider, signInWithPopup} from "firebase/auth";

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

/**
 * Sign in with Google, updates the UI, and queries the target of the current user.
 */
document.getElementById("signIn").onclick = () => {
    signInWithPopup(auth, provider).then(result => {
        const name = result.user.displayName;
        document.getElementById("name").innerHTML += name;
        document.getElementById("signIn").style.display = "none";
        //@ts-ignore
        for(const gameElement of document.getElementsByClassName("game")) {
            gameElement.style.display = "";
        }
        document.getElementById("name").style.display = "";
        document.getElementById("round").style.display = "";
        document.getElementById("alive").style.display = "";
        document.getElementById("target").style.display = "";
        result.user.getIdTokenResult().then(idTokenResult => {
            if (idTokenResult.claims.admin) {
                // @ts-ignore
                for (const adminElement of document.getElementsByClassName("admin")) {
                    if (!adminElement.id.startsWith("creating")) {
                        adminElement.style.display = "";
                    }
                }
            }
        })
        queryAndHandleTarget();
    });
}

/**
 * Eliminates the target of the current user, queries the new target of the current user, and updates the user.
 */
document.getElementById("eliminate").onclick = () => {
    if (confirm("Are you sure you want to eliminate your target?")) {
        document.getElementById("eliminate").style.display = "none";
        document.getElementById("eliminating").style.display = "";
        eliminateAndHandleTarget();
    }
}

document.getElementById("newRound").onclick = () => {
    if (confirm("Are you sure you want to finish this round and start the next round?")) {
        document.getElementById("newRound").style.display = "none";
        document.getElementById("creatingNewRound").style.display = "";
        const newRound = httpsCallable(functions, "newRound");
        newRound().then(() => {
            document.getElementById("newRound").style.display = "";
            document.getElementById("creatingNewRound").style.display = "none";
            queryAndHandleTarget();
        });
    }
}

/**
 * Queries the target of the current user and updates the UI.
 */
function queryAndHandleTarget() {
    const queryTarget = httpsCallable(functions, "queryTarget");
    queryTarget().then((result: {
        data: { email: string, round: number, alive: boolean, targetEmail: string, targetName: string }
    }) => {
        if (result === null || result.data === null) {
            console.log("query target result is null");
            return;
        }
        console.log("received query target result: ", result.data);
        handleTarget(result.data.email, result.data.round, result.data.alive, result.data.targetEmail, result.data.targetName)
    }).catch(error => {
        console.log(error);
    });
}

/**
 * Eliminates the target of the current user, queries the new target of the current user, and updates the UI.
 */
function eliminateAndHandleTarget() {
    const eliminateTarget = httpsCallable(functions, "eliminateTarget");
    eliminateTarget().then((result: {
        data: { email: string, round: number, alive: boolean, targetEmail: string, targetName: string }
    }) => {
        if (result === null || result.data === null) {
            console.log("query new target result is null");
            return;
        }
        console.log("received query new target result: ", result.data);
        handleTarget(result.data.email, result.data.round, result.data.alive, result.data.targetEmail, result.data.targetName);
        document.getElementById("eliminating").style.display = "none";
    });
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
}