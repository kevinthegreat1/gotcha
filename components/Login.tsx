import {SafeAreaView, View} from "react-native";
import {useEffect, useState} from "react";
import {GoogleSignin, GoogleSigninButton} from "@react-native-google-signin/google-signin";

export default function Login() {
  const [user, setUser] = useState();
  const [error, setError] = useState();

  useEffect(() => {
    GoogleSignin.configure();
  }, []);

  const signIn = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      setUser(await GoogleSignin.signIn());
      setError();
    } catch (e) {
      setError(e);
    }
  }

  const logout = async () => {
    try {
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
      setUser();
      setError();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <View>
      <SafeAreaView>
        <View>
          <GoogleSigninButton onPress={signIn}/>
        </View>
      </SafeAreaView>
    </View>
  )
}
