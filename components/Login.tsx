import {SafeAreaView, Text, TouchableOpacity, View} from "react-native";
import {useState} from "react";
import {auth, provider} from "../firebaseConfig";

export default function Login() {
  const [loading, setLoading] = useState(false);

  return (
    <View>
      <SafeAreaView>
        <View>
          <TouchableOpacity onPress={() => {
            setLoading(true);
          }}>
            <View>
              <View>
                <Text>Login with Google</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  )
}