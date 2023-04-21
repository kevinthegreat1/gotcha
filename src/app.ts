// Import the functions you need from the SDKs you need
import {initializeApp} from "firebase/app";
import {getAnalytics} from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import {collection, doc, getDoc, getFirestore} from "firebase/firestore";

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

// Initialize Firestore
const database = getFirestore();
const gamesCollection = collection(database, 'games');
const gameDoc = doc(gamesCollection, "test-game-01");

let player;
let name;
let alive;
let targetEmail;

getDoc(gameDoc).then(snapshot => {
    player = snapshot.data().players["test1@example.com"];
    name = player.name;
    alive = player.alive;
    targetEmail = player.targetEmail;
    document.getElementById("alive").innerHTML += alive ? "alive" : "unalive";
    document.getElementById("target").innerHTML += targetEmail;
}).catch(error => {
    console.log(error);
});