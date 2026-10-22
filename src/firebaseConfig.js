import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyALyt8cD2VVP0jZnge-k7oTwsGqKbhWQuU",
  authDomain: "foodgrade-a099f.firebaseapp.com",
  databaseURL: "https://foodgrade-a099f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "foodgrade-a099f",
  storageBucket: "foodgrade-a099f.firebasestorage.app",
  messagingSenderId: "128759188536",
  appId: "1:128759188536:web:43c8c5df246ff7ea6aeacd",
  measurementId: "G-113G7EFL1F"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);