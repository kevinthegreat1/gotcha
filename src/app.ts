// Import the functions you need from the SDKs you need
import {initializeApp} from "firebase/app";
import {getAnalytics} from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import {collection, doc, getDoc, getFirestore} from "firebase/firestore";
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

document.getElementById("signIn").onclick = function signIn() {
    signInWithPopup(auth, provider).then(result => {
        const user = result.user;
        const name = result.user.displayName;
        const email = result.user.email;
        document.getElementById("name").innerHTML += name;
        document.getElementById("signIn").style.visibility = "hidden";
        document.getElementById("name").style.visibility = "visible";
        document.getElementById("alive").style.visibility = "visible";
        document.getElementById("target").style.visibility = "visible";
    });
}

// Initialize Firestore
const database = getFirestore();
const gamesCollection = collection(database, 'games');
const gameDoc = doc(gamesCollection, "test-game-01");

getDoc(gameDoc).then(snapshot => {
    const player = snapshot.data().players["test1@example.com"];
    const name = player.name;
    const alive = player.alive;
    const targetEmail = player.targetEmail;
    document.getElementById("alive").innerHTML += alive ? "alive" : "unalive";
    document.getElementById("target").innerHTML += name;
}).catch(error => {
    console.log(error);
});