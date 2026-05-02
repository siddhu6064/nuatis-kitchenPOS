import { useAuth } from "@/lib/api/AuthContext";
import { POS } from "@/pages/POS";
import { Login } from "@/pages/Login";

function App() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <POS /> : <Login />;
}

export default App;
