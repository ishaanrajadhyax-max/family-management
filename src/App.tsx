import DadApp from './features/dad/DadApp'

// Only the Dad section exists so far. Once role-based access is built,
// this will route between Dad, Mom, and Ishaan's (Admin) views based on
// who is signed in.
function App() {
  return <DadApp />
}

export default App
