import { Text } from "react-native";
import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../firebaseConfig";
import Login from "../components/Login";

export default function Index() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    onAuthStateChanged(auth, user => {
      setUser(user);
    })
  }, []);

  return user ? <Text>Gotcha!</Text> : <Login/>;
}
